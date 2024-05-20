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
import { createVideoStatsReport } from './utils/webrtc';

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
        case 'closed':
        case 'disconnected':
        default:
            return ConnectionState.New;
    }
}

function pollStats(peerConnection, onVideoStateChange, analytics) {
    let videoStats = [] as SlimRTCStatsReport[];
    let videoStatsStartIndex = 0;
    let videoStatsLastIndex = 0;
    let isStreaming = false;
    let consecutiveNoBytesIntervals = 0;
    const MAX_NO_BYTES_INTERVALS = 10;

    return setInterval(() => {
        const stats = peerConnection.getStats();
        stats.then(result => {
            result.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    videoStatsLastIndex = videoStats.length - 1;
                    if (report && videoStats[videoStatsLastIndex]) {
                        const currBytesReceived = report.bytesReceived;
                        const lastBytesReceived = videoStats[videoStatsLastIndex].bytesReceived;

                        if (currBytesReceived - lastBytesReceived > 0) {
                            consecutiveNoBytesIntervals = 0;
                            if (!isStreaming) {
                                onVideoStateChange?.(StreamingState.Start, report);

                                isStreaming = true;

                                videoStatsStartIndex = videoStats.length;
                            }
                        } else {
                            consecutiveNoBytesIntervals++;
                            if (isStreaming && consecutiveNoBytesIntervals >= MAX_NO_BYTES_INTERVALS) {
                                onVideoStateChange?.(StreamingState.Stop, createVideoStatsReport(videoStats));

                                isStreaming = false;

                                const stats = videoStats.slice(videoStatsStartIndex);
                                const previousStats =
                                    videoStatsStartIndex === 0 ? undefined : videoStats[videoStatsStartIndex - 1];
                                const videoStatsReport = createVideoStatsReport(stats, previousStats)
                                    .sort((a, b) => b.packetsLost - a.packetsLost)
                                    .slice(0, 5);

                                analytics.track('agent-video', { event: 'stats', rtc: videoStatsReport });
                            }
                        }
                    }
                    videoStats.push(report);
                }
            });
        });
    }, 100);
}

export async function createStreamingManager<T extends CreateStreamOptions>(
    agentId: string,
    agent: T,
    { debug = false, callbacks, auth, analytics, baseURL = didApiUrl }: StreamingManagerOptions
) {
    _debug = debug;
    let srcObject: MediaStream | null = null;
    let timeoutId: NodeJS.Timeout;

    const { startConnection, sendStreamRequest, close, createStream, addIceCandidate } =
        agent.videoType === VideoType.Clip
            ? createClipApi(auth, baseURL, agentId)
            : createTalkApi(auth, baseURL, agentId);

    const { id: streamIdFromServer, offer, ice_servers, session_id } = await createStream(agent);
    const peerConnection = new actualRTCPC({ iceServers: ice_servers });
    const pcDataChannel = peerConnection.createDataChannel('JanusDataChannel');

    if (!session_id) {
        throw new Error('Could not create session_id');
    }

    const videoStatsInterval = pollStats(peerConnection, callbacks.onVideoStateChange, analytics);

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
            timeoutId = setTimeout(() => {
                callbacks.onConnectionStateChange?.(ConnectionState.Connected);
            }, 5000);
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

                if (peerConnection) {
                    const state = mapConnectionState(peerConnection.iceConnectionState);
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
                    await close(streamIdFromServer, session_id).catch(_ => { });
                } catch (e) {
                    log('Error on close stream connection', e);
                }
                callbacks.onConnectionStateChange?.(ConnectionState.New);
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
