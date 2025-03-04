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
import { didApiUrl } from '../../environment';
import { pollStats } from './stats/poll';

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
    };

    const videoStatsInterval = pollStats(
        peerConnection,
        getIsConnected,
        onConnected,
        callbacks.onVideoStateChange,
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

    pcDataChannel.onmessage = (message: MessageEvent) => {
        if (pcDataChannel.readyState === 'open') {
            const [event, _] = message.data.split(':');

            if (event === StreamEvents.StreamReady && !isConnected) {
                onConnected();
            }
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
