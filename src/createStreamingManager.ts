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

function pollStats(peerConnection, onVideoStateChange) {
    let videoStats = [] as SlimRTCStatsReport[];
    let videoStatsStartIndex = 0;
    let videoStatsLastIndex = 0;
    let isPlaying: boolean;

    return setInterval(() => {
        const stats = peerConnection.getStats();
        stats.then(result => {
            result.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    videoStatsLastIndex = videoStats.length - 1;
                    if (report && videoStats[videoStatsLastIndex]) {
                        const currBytesReceived = report.bytesReceived;
                        const lastBytesReceived = videoStats[videoStatsLastIndex].bytesReceived;
                        let prevPlaying = isPlaying;
                        isPlaying = currBytesReceived - lastBytesReceived > 0;
                        let videoStatsReport;
                        if (prevPlaying !== isPlaying) {
                            if (isPlaying) {
                                videoStatsStartIndex = videoStats.length;
                            } else {
                                const stats = videoStats.slice(videoStatsStartIndex);
                                const previousStats =
                                    videoStatsStartIndex === 0 ? undefined : videoStats[videoStatsStartIndex - 1];
                                videoStatsReport = createVideoStatsReport(stats, previousStats);
                                videoStatsReport = videoStatsReport
                                    .sort((a, b) => b.packetsLost - a.packetsLost)
                                    .slice(0, 5);
                            }
                            onVideoStateChange?.(
                                isPlaying ? StreamingState.Start : StreamingState.Stop,
                                videoStatsReport
                            );
                        }
                    }
                    videoStats.push(report);
                }
            });
        });
    }, 500);
}

export async function createStreamingManager<T extends CreateStreamOptions>(
    agent: T,
    { debug = false, callbacks, auth, analytics, baseURL = didApiUrl }: StreamingManagerOptions
) {
    _debug = debug;
    let srcObject: MediaStream | null = null;
    let timeoutId: NodeJS.Timeout;

    const { startConnection, sendStreamRequest, close, createStream, addIceCandidate } =
        agent.videoType === VideoType.Clip ? createClipApi(auth, baseURL) : createTalkApi(auth, baseURL);

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
            const [event, data] = message.data.split(':');

            if (event === StreamEvents.StreamStarted) {
                analytics?.track('agent-video', { event: 'start', ...message });
            } else if (event === StreamEvents.StreamDone) {
                analytics?.track('agent-video', { event: 'stop', ...message });
            } else if (event === StreamEvents.StreamFailed) {
                callbacks.onVideoStateChange?.(StreamingState.Stop, { event, data });
                clearInterval(videoStatsInterval);
            } else if (event === StreamEvents.StreamReady) {
                clearTimeout(timeoutId);
                callbacks.onConnectionStateChange?.(ConnectionState.Connected);
            } else if (event === StreamEvents.StreamCreated) {
                analytics?.track('agent-video', { event: 'created', ...message });
            } else if (event === StreamEvents.StreamVideoCreated) {
                analytics?.track('agent-video', { event: 'video-created', ...message });
            } else if (event === StreamEvents.StreamVideoDone) {
                analytics?.track('agent-video', { event: 'video-done', ...message });
            } else if (event === StreamEvents.StreamVideoError) {
                analytics?.track('agent-video', { event: 'video-error', ...message });
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
                    peerConnection.close();
                    peerConnection.oniceconnectionstatechange = null;
                    peerConnection.onnegotiationneeded = null;
                    peerConnection.onicecandidate = null;
                    peerConnection.ontrack = null;
                }

                await close(streamIdFromServer, session_id).catch(_ => {});
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
