import { createClipApi, createTalkApi } from '$/api/streams';
import { didApiUrl } from '$/config/environment';
import {
    AgentActivityState,
    ConnectionState,
    CreateStreamOptions,
    DataChannelSignalMap,
    PayloadType,
    StreamType,
    StreamingManagerOptions,
    StreamingState,
    VideoType,
} from '$/types/index';
import { ConnectivityState } from '$/types/stream/stream';
import { pollStats } from './stats/poll';
import { VideoRTCStatsReport } from './stats/report';

let _debug = false;
const log = (message: string, extra?: any) => _debug && console.log(message, extra);
const actualRTCPC = (
    window.RTCPeerConnection ||
    (window as any).webkitRTCPeerConnection ||
    (window as any).mozRTCPeerConnection
).bind(window);

function mapConnectionState(state: RTCIceConnectionState): ConnectionState {
    switch (state) {
        case 'connected':
            return ConnectionState.Connected;
        case 'checking':
            return ConnectionState.Connecting;
        case 'failed':
            return ConnectionState.Fail;
        case 'new':
            return ConnectionState.New;
        case 'closed':
            return ConnectionState.Closed;
        case 'disconnected':
            return ConnectionState.Disconnected;
        case 'completed':
            return ConnectionState.Completed;
        default:
            return ConnectionState.New;
    }
}

function handleLegacyStreamState({
    statsSignal,
    dataChannelSignal,
    onVideoStateChange,
    report,
}: {
    statsSignal?: StreamingState;
    dataChannelSignal?: StreamingState;
    onVideoStateChange: StreamingManagerOptions['callbacks']['onVideoStateChange'];
    report?: VideoRTCStatsReport;
}) {
    if (statsSignal === StreamingState.Start && dataChannelSignal === StreamingState.Start) {
        onVideoStateChange?.(StreamingState.Start);
    } else if (statsSignal === StreamingState.Stop && dataChannelSignal === StreamingState.Stop) {
        onVideoStateChange?.(StreamingState.Stop, report);
    }
}

function handleFluentStreamState({
    statsSignal,
    dataChannelSignal,
    onVideoStateChange,
    onAgentActivityStateChange,
    report,
}: {
    statsSignal?: StreamingState;
    dataChannelSignal?: StreamingState;
    onVideoStateChange: StreamingManagerOptions['callbacks']['onVideoStateChange'];
    onAgentActivityStateChange?: StreamingManagerOptions['callbacks']['onAgentActivityStateChange'];
    report?: VideoRTCStatsReport;
}) {
    if (statsSignal === StreamingState.Start) {
        onVideoStateChange?.(StreamingState.Start);
    } else if (statsSignal === StreamingState.Stop) {
        onVideoStateChange?.(StreamingState.Stop, report);
    }

    if (dataChannelSignal === StreamingState.Start) {
        onAgentActivityStateChange?.(AgentActivityState.Talking);
    } else if (dataChannelSignal === StreamingState.Stop) {
        onAgentActivityStateChange?.(AgentActivityState.Idle);
    }
}

function handleStreamState({
    statsSignal,
    dataChannelSignal,
    onVideoStateChange,
    onAgentActivityStateChange,
    streamType,
    report,
}: {
    statsSignal?: StreamingState;
    dataChannelSignal?: StreamingState;
    onVideoStateChange: StreamingManagerOptions['callbacks']['onVideoStateChange'];
    onAgentActivityStateChange?: StreamingManagerOptions['callbacks']['onAgentActivityStateChange'];
    streamType: StreamType;
    report?: VideoRTCStatsReport;
}) {
    if (streamType === StreamType.Legacy) {
        handleLegacyStreamState({ statsSignal, dataChannelSignal, onVideoStateChange, report });
    } else if (streamType === StreamType.Fluent) {
        handleFluentStreamState({
            statsSignal,
            dataChannelSignal,
            onVideoStateChange,
            onAgentActivityStateChange,
            report,
        });
    }
}

export async function createStreamingManager<T extends CreateStreamOptions>(
    agentId: string,
    agent: T,
    { debug = false, callbacks, auth, baseURL = didApiUrl, analytics }: StreamingManagerOptions
) {
    console.log("createStreamingManager::TEST");
    _debug = debug;
    let srcObject: MediaStream | null = null;
    let isConnected = false;
    let isDatachannelOpen = false;
    let dataChannelSignal: StreamingState = StreamingState.Stop;
    let statsSignal: StreamingState = StreamingState.Stop;
    let connectivityState: ConnectivityState = ConnectivityState.Unknown;

    const { startConnection, sendStreamRequest, close, createStream, addIceCandidate } =
        agent.videoType === VideoType.Clip
            ? createClipApi(auth, baseURL, agentId, callbacks.onError)
            : createTalkApi(auth, baseURL, agentId, callbacks.onError);

    const { id: streamIdFromServer, offer, ice_servers, session_id, fluent } = await createStream(agent);
    const peerConnection = new actualRTCPC({ iceServers: ice_servers });
    const pcDataChannel = peerConnection.createDataChannel('JanusDataChannel');

    if (!session_id) {
        throw new Error('Could not create session_id');
    }

    const streamType = fluent ? StreamType.Fluent : StreamType.Legacy;

    analytics.enrich({
        'stream-type': streamType,
    });

    const warmup = agent.stream_warmup && !fluent;

    const getIsConnected = () => isConnected;
    const onConnected = () => {
        isConnected = true;

        if (isDatachannelOpen) {
            callbacks.onConnectionStateChange?.(ConnectionState.Connected);
        }
    };

    const videoStatsInterval = pollStats(
        peerConnection,
        getIsConnected,
        onConnected,
        (state, report) =>
            handleStreamState({
                statsSignal: (statsSignal = state),
                dataChannelSignal: streamType === StreamType.Legacy ? dataChannelSignal : undefined,
                onVideoStateChange: callbacks.onVideoStateChange,
                onAgentActivityStateChange: callbacks.onAgentActivityStateChange,
                report,
                streamType,
            }),
        state => callbacks.onConnectivityStateChange?.(connectivityState),
        warmup
    );

    peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        log('peerConnection.onicecandidate', event);

        try {
            if (event.candidate && event.candidate.sdpMid && event.candidate.sdpMLineIndex !== null) {
                addIceCandidate(
                    streamIdFromServer,
                    {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                    },
                    session_id
                );
            } else {
                addIceCandidate(streamIdFromServer, { candidate: null }, session_id);
            }
        } catch (e: any) {
            callbacks.onError?.(e, { streamId: streamIdFromServer });
        }
    };

    pcDataChannel.onopen = () => {
        isDatachannelOpen = true;

        if (!warmup || isConnected) {
            onConnected();
        }
    };

    pcDataChannel.onmessage = (event: MessageEvent) => {
        if (event.data in DataChannelSignalMap) {
            dataChannelSignal = DataChannelSignalMap[event.data];

            handleStreamState({
                statsSignal: streamType === StreamType.Legacy ? statsSignal : undefined,
                dataChannelSignal,
                onVideoStateChange: callbacks.onVideoStateChange,
                onAgentActivityStateChange: callbacks.onAgentActivityStateChange,
                streamType,
            });
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        log('peerConnection.oniceconnectionstatechange => ' + peerConnection.iceConnectionState);

        const newState = mapConnectionState(peerConnection.iceConnectionState);

        if (newState !== ConnectionState.Connected) {
            callbacks.onConnectionStateChange?.(newState);
        }
    };

    peerConnection.ontrack = (event: RTCTrackEvent) => {
        log('peerConnection.ontrack', event);
        callbacks.onSrcObjectReady?.(event.streams[0]);
    };

    await peerConnection.setRemoteDescription(offer);
    log('set remote description OK');

    const sessionClientAnswer = await peerConnection.createAnswer();
    log('create answer OK');

    await peerConnection.setLocalDescription(sessionClientAnswer);
    log('set local description OK');

    await startConnection(streamIdFromServer, sessionClientAnswer, session_id);
    log('start connection OK');

    return {
        /**
         * Method to send request to server to get clip or talk depend on you payload
         * @param payload
         */
        speak(payload: PayloadType<T>) {
            return sendStreamRequest(streamIdFromServer, session_id, payload);
        },
        /**
         * Method to close RTC connection
         */
        async disconnect() {
            if (streamIdFromServer) {
                if (srcObject) {
                    srcObject.getTracks().forEach(track => track.stop());
                    srcObject = null;
                }

                const state = mapConnectionState(peerConnection.iceConnectionState);

                if (peerConnection) {
                    if (state === ConnectionState.New) {
                        // Connection already closed
                        callbacks.onVideoStateChange?.(StreamingState.Stop);
                        clearInterval(videoStatsInterval);
                        return;
                    }

                    peerConnection.close();
                    peerConnection.oniceconnectionstatechange = null;
                    peerConnection.onnegotiationneeded = null;
                    peerConnection.onicecandidate = null;
                    peerConnection.ontrack = null;
                }

                try {
                    if (state === ConnectionState.Connected) {
                        await close(streamIdFromServer, session_id).catch(_ => {});
                    }
                } catch (e) {
                    log('Error on close stream connection', e);
                }

                callbacks.onVideoStateChange?.(StreamingState.Stop);
                callbacks.onAgentActivityStateChange?.(AgentActivityState.Idle);
                clearInterval(videoStatsInterval);
            }
        },
        /**
         * Session identifier information, should be returned in the body of all streaming requests
         */
        sessionId: session_id,
        /**
         * Id of current RTC stream
         */
        streamId: streamIdFromServer,

        streamType,
    };
}

export type StreamingManager<T extends CreateStreamOptions> = Awaited<ReturnType<typeof createStreamingManager<T>>>;
