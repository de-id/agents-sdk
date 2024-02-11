import { createApi as createClipApi } from '$/api/clipStream';
import { createApi as createTalkApi } from '$/api/talkStream';
import { CreateStreamOptions, PayloadType, SlimRTCStatsReport, StreamingManagerOptions, StreamingState, VideoType } from '%/index'
import { createVideoStatsReport } from '$/utils/webrtc';

let _debug = false;
const log = (message: string, extra?: any) => _debug && console.log(message, extra);
const actualRTCPC = (
    window.RTCPeerConnection ||
    (window as any).webkitRTCPeerConnection ||
    (window as any).mozRTCPeerConnection
).bind(window);

export async function createStreamingManager<T extends CreateStreamOptions>(
    agent: T,
    { debug = false, callbacks, auth, baseURL = 'https://api.d-id.com' }: StreamingManagerOptions
) {
    _debug = debug;
    let srcObject: MediaStream | null = null;

    const { startConnection, sendStreamRequest, close, createStream, addIceCandidate } =
        agent.videoType === VideoType.Clip ? createClipApi(auth, baseURL) : createTalkApi(auth, baseURL);

    const { id: streamIdFromServer, offer, ice_servers, session_id } = await createStream(agent);
    const peerConnection = new actualRTCPC({ iceServers: ice_servers });
    const pcDataChannel = peerConnection.createDataChannel('JanusDataChannel');
    const videoStats = [] as SlimRTCStatsReport[];
    let videoStatsStartIndex = 0;
    let videoStatsInterval: NodeJS.Timeout;

    if (!session_id) {
        throw new Error('Could not create session_id');
    }

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
    };

    peerConnection.ontrack = (event: RTCTrackEvent) => {
        log('peerConnection.ontrack', event);
        callbacks.onSrcObjectReady?.(event.streams[0]);
    };

    pcDataChannel.onmessage = (message: MessageEvent) => {
        if (pcDataChannel.readyState === 'open') {
            if (message.data === 'stream/started') {
                videoStatsStartIndex = videoStats.length;
                videoStatsInterval = setInterval(() => {
                    const stats = peerConnection.getStats();
                    stats.then((result) => {
                        result.forEach((report) => {
                            if (report.type === 'inbound-rtp' && report.kind === 'video') {
                                videoStats.push(report);
                            }
                        });
                    });
                }, 1000);
            }
            else if (message.data === 'stream/done') {
                clearInterval(videoStatsInterval);
                const stats = videoStats.slice(videoStatsStartIndex);
                if (stats) {
                    const previousStats = videoStatsStartIndex === 0 ? undefined : videoStats[videoStatsStartIndex - 1];
                    const videoStatsReport = createVideoStatsReport(stats, previousStats);
                    videoStatsStartIndex = videoStats.length;
                    callbacks.onVideoStateChange?.(StreamingState.Stop, videoStatsReport.sort((a, b) => b.packetsLost - a.packetsLost).slice(0, 5));
                }
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
        speak(payload: PayloadType<T>) {
            return sendStreamRequest(streamIdFromServer, session_id, payload);
        },
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

                await close(streamIdFromServer, session_id);
                callbacks.onConnectionStateChange?.('closed');
                callbacks.onVideoStateChange?.(StreamingState.Stop);
            }
        },
        sessionId: session_id,
        streamId: streamIdFromServer,
    };
}

export type StreamingManager<T extends CreateStreamOptions> = Awaited<ReturnType<typeof createStreamingManager<T>>>;
