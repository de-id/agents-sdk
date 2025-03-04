import { createApi as createClipApi } from '$/api/clipStream';
import { createApi as createTalkApi } from '$/api/talkStream';
import {
    ConnectionState,
    CreateStreamOptions,
    PayloadType,
    SlimRTCStatsReport,
    StreamEvents,
    StreamingManagerOptions,
    StreamingState,
    VideoType,
} from '$/types/index';
import { didApiUrl } from './environment';
import { formatStats, createVideoStatsReport } from './utils/webrtc';

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

function createVideoStatsAnalyzer() {
    let lastBytesReceived = 0;

    return (stats: RTCStatsReport) => {
        for (const report of stats.values()) {
            if (report && report.type === 'inbound-rtp' && report.kind === 'video') {
                const currBytesReceived = report.bytesReceived;
                const isReceiving = currBytesReceived - lastBytesReceived > 0;

                lastBytesReceived = currBytesReceived;

                return isReceiving;
            }
        }

        return false;
    };
}


function pollStats(
    peerConnection: RTCPeerConnection,
    onVideoStateChange,
    warmup: boolean = false,
    getIsConnected: () => boolean,
    onConnected: () => void,
    shouldWaitForGreeting: boolean = false) {
    const interval = 100;
    const notReceivingIntervalsThreshold = Math.max(Math.ceil(1000 / interval), 1);
    let allStats: SlimRTCStatsReport[] = [];
    let previousStats: SlimRTCStatsReport;

    let notReceivingNumIntervals = 0;
    let isStreaming = false;

    const streamsBeforeReady = warmup ? 1 : 0;
    let streamsCount = 0;

    const isReceivingVideoBytes = createVideoStatsAnalyzer();

    return setInterval(async () => {
        const stats = await peerConnection.getStats();
        const isReceiving = isReceivingVideoBytes(stats);
        const slimStats = formatStats(stats);

        if (isReceiving) {
            notReceivingNumIntervals = 0;

            if (!isStreaming) {
                onVideoStateChange?.(StreamingState.Start);
                if (shouldWaitForGreeting && streamsCount >= streamsBeforeReady && !getIsConnected()) {
                    onConnected();
                }
                previousStats = allStats[allStats.length - 1];
                allStats = [];
                streamsCount++;
                isStreaming = true;
            }
            allStats.push(slimStats);
        } else if (isStreaming) {
            notReceivingNumIntervals++;

            if (notReceivingNumIntervals >= notReceivingIntervalsThreshold) {
                const statsReport = createVideoStatsReport(allStats, interval, previousStats)
                onVideoStateChange?.(StreamingState.Stop, statsReport);
                if (!shouldWaitForGreeting && !getIsConnected()) {
                    onConnected();
                }

                isStreaming = false;
            }
        }
    }, interval);
}

export async function createStreamingManager<T extends CreateStreamOptions>(
    agentId: string,
    agent: T,
    { debug = false, callbacks, auth, baseURL = didApiUrl, warmup }: StreamingManagerOptions
) {
    _debug = debug;
    let srcObject: MediaStream | null = null;

    const { startConnection, sendStreamRequest, close, createStream, addIceCandidate } =
    agent.videoType === VideoType.Clip
    ? createClipApi(auth, baseURL, agentId, callbacks.onError)
    : createTalkApi(auth, baseURL, agentId, callbacks.onError);

    const { id: streamIdFromServer, offer, ice_servers, session_id } = await createStream(agent);
    const peerConnection = new actualRTCPC({ iceServers: ice_servers });
    const pcDataChannel = peerConnection.createDataChannel('JanusDataChannel');

    if (!session_id) {
        throw new Error('Could not create session_id');
    }

    let isConnected = false;
    const getIsConnected = () => isConnected;
    const onConnected = () => {
        isConnected = true;
        callbacks.onConnectionStateChange?.(ConnectionState.Connected);
    }

    const videoStatsInterval = pollStats(
        peerConnection,
        callbacks.onVideoStateChange,
        warmup,
        getIsConnected,
        onConnected,
        !!agent.stream_greeting
    );

    peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        log('peerConnection.onicecandidate', event);
        try{
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
        if (!agent.stream_warmup && !agent.stream_greeting) {
            onConnected();
        }
    }


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
    };
}

export type StreamingManager<T extends CreateStreamOptions> = Awaited<ReturnType<typeof createStreamingManager<T>>>;
