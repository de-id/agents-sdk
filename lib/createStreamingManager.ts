import { createApi as createClipApi } from '$/api/clipStream';
import { createApi as createTalkApi } from '$/api/talkStream';
import { CreateStreamOptions, PayloadType, StreamingManagerOptions, StreamingState, VideoType } from '%/index'

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
            callbacks.onVideoStateChange?.(message.data === 'stream/done' ? StreamingState.Stop : StreamingState.Start);
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
