import { createApi as createClipApi } from '$/api/clipStream';
import { createApi as createTalkApi } from '$/api/talkStream';
import {
    ConnectionState,
    CreateStreamOptions,
    PayloadType,
    StreamEvents,
    StreamingManagerOptions,
    StreamingState,
    VideoType,
} from '$/types/index';
import { didApiUrl } from './environment';

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

function pollStats(peerConnection: RTCPeerConnection, onVideoStateChange) {
    const interval = 100;
    const notReceivingIntervalsThreshold = Math.max(Math.ceil(1000 / interval), 1);

    let notReceivingNumIntervals = 0;
    let isStreaming = false;

    const isReceivingVideoBytes = createVideoStatsAnalyzer();

    return setInterval(async () => {
        const stats = await peerConnection.getStats();
        const isReceiving = isReceivingVideoBytes(stats);

        if (isReceiving) {
            notReceivingNumIntervals = 0;

            if (!isStreaming) {
                onVideoStateChange?.(StreamingState.Start);

                isStreaming = true;
            }
        } else if (isStreaming) {
            notReceivingNumIntervals++;

            if (notReceivingNumIntervals >= notReceivingIntervalsThreshold) {
                onVideoStateChange?.(StreamingState.Stop);

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
    let timeoutId: NodeJS.Timeout;

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

    const videoStatsInterval = pollStats(peerConnection, callbacks.onVideoStateChange);

    peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        log('peerConnection.onicecandidate', event);
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
    };

    peerConnection.oniceconnectionstatechange = () => {
        log('peerConnection.oniceconnectionstatechange => ' + peerConnection.iceConnectionState);

        const newState = mapConnectionState(peerConnection.iceConnectionState);

        if (newState === ConnectionState.Connected) {
            timeoutId = setTimeout(
                () => callbacks.onConnectionStateChange?.(ConnectionState.Connected),
                warmup ? 0 : 5000
            );
        } else {
            clearTimeout(timeoutId);
            callbacks.onConnectionStateChange?.(newState);
        }
    };

    peerConnection.ontrack = (event: RTCTrackEvent) => {
        log('peerConnection.ontrack', event);
        callbacks.onSrcObjectReady?.(event.streams[0]);
    };

    pcDataChannel.onmessage = (message: MessageEvent) => {
        if (pcDataChannel.readyState === 'open') {
            const [event, _] = message.data.split(':');
            if (event === StreamEvents.StreamReady) {
                clearTimeout(timeoutId);
                callbacks.onConnectionStateChange?.(ConnectionState.Connected);
            }
        }
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
