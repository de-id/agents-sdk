import { createApi as createClipApi } from '$/api/clipStream';
import { createApi as createTalkApi } from '$/api/talkStream';
import {
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
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        log('peerConnection.oniceconnectionstatechange => ' + peerConnection.iceConnectionState);
        callbacks.onConnectionStateChange?.(peerConnection.iceConnectionState);
        analytics?.track('agent-chat-loaded');
    };

    peerConnection.ontrack = (event: RTCTrackEvent) => {
        log('peerConnection.ontrack', event);
        analytics?.track('agent-src-object-ready');
        callbacks.onSrcObjectReady?.(event.streams[0]);
    };

    pcDataChannel.onmessage = (message: MessageEvent) => {
        if (pcDataChannel.readyState === 'open') {
            const [event, data] = message.data.split(':');

            if (event === StreamEvents.StreamStarted) {
                console.log('StreamStarted', event, data);
                analytics?.track('agent-video', {
                    event,
                    rtcStats: data ?? [] 
                })
            } else if (event === StreamEvents.StreamDone) {
                console.log('StreamDone');
            } else if (event === StreamEvents.StreamFailed) {
                callbacks.onVideoStateChange?.(StreamingState.Stop, { event, data });

                clearInterval(videoStatsInterval);
                console.log('StreamFailed');
            } else {
                // Better remove it, because it's too noisy, since message have too many partial messages
                analytics?.track('agent-on-message-streaming', {
                    event
                });
                callbacks.onMessage?.(event, decodeURIComponent(data));
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
        async terminate() {
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
                callbacks.onConnectionStateChange?.('closed');
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
