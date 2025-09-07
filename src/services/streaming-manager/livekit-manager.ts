import {
    AgentActivityState,
    ConnectionState,
    CreateStreamOptions,
    PayloadType,
    StreamType,
    StreamingManagerOptions,
    StreamingState,
} from '$/types';
import { RemoteAudioTrack, RemoteParticipant, RemoteTrack, RemoteVideoTrack, Room, RoomEvent } from 'livekit-client';
import { createStreamApiV2 } from '../../api/streams/streamsApiV2';

let _debug = false;
const log = (message: string, extra?: any) => _debug && console.log(message, extra);

export async function createLiveKitStreamingManager<T extends CreateStreamOptions>(
    agentId: string,
    agent: T,
    options: StreamingManagerOptions
): Promise<{
    speak(payload: PayloadType<T>): Promise<any>;
    disconnect(): Promise<void>;
    sendDataChannelMessage(payload: string): void;
    sessionId: string;
    streamId: string;
    streamType: StreamType;
    interruptAvailable: boolean;
}> {
    _debug = options.debug || false;

    const { callbacks, auth, baseURL, analytics } = options;
    let room: Room | null = null;
    let isConnected = false;
    let videoId: string | null = null;

    // Create LiveKit room
    room = new Room({
        adaptiveStream: true,
        dynacast: true,
    });

    // Set up event handlers
    room.on(RoomEvent.Connected, () => {
        log('LiveKit room connected successfully');
        isConnected = true;
        callbacks.onConnectionStateChange?.(ConnectionState.Connected);
    });

    room.on(RoomEvent.Disconnected, () => {
        log('LiveKit room disconnected');
        isConnected = false;
        callbacks.onConnectionStateChange?.(ConnectionState.Disconnected);
    });

    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        log('Participant connected:', participant.identity);
    });

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant: RemoteParticipant) => {
        log(`Track subscribed: ${track.kind} from ${participant.identity}`);

        if (track.kind === 'video') {
            const videoTrack = track as RemoteVideoTrack;
            const videoElement = document.createElement('video');
            videoElement.srcObject = new MediaStream([videoTrack.mediaStreamTrack]);
            videoElement.autoplay = true;
            videoElement.playsInline = true;

            // Attach to DOM or call callback
            if (videoElement.srcObject) {
                callbacks.onSrcObjectReady?.(videoElement.srcObject);
            }
        } else if (track.kind === 'audio') {
            const audioTrack = track as RemoteAudioTrack;
            const audioElement = document.createElement('audio');
            audioElement.srcObject = new MediaStream([audioTrack.mediaStreamTrack]);
            audioElement.autoplay = true;

            // Handle audio if needed
        }
    });

    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        const message = new TextDecoder().decode(payload);
        log('Data received:', message);

        // Handle data channel messages similar to WebRTC
        try {
            const data = JSON.parse(message);
            if (data.subject === 'stream_started' && data.metadata?.videoId) {
                videoId = data.metadata.videoId;
                callbacks.onVideoIdChange?.(videoId);
                callbacks.onVideoStateChange?.(StreamingState.Start);
                callbacks.onAgentActivityStateChange?.(AgentActivityState.Talking);
            } else if (data.subject === 'stream_done') {
                videoId = null;
                callbacks.onVideoIdChange?.(videoId);
                callbacks.onVideoStateChange?.(StreamingState.Stop);
                callbacks.onAgentActivityStateChange?.(AgentActivityState.Idle);
            }
        } catch (e) {
            log('Failed to parse data channel message:', e);
        }
    });

    // Create stream using V2 API
    const streamApi = createStreamApiV2(auth, baseURL || '', agentId, callbacks.onError);
    const streamResponse = await streamApi.createStream({
        transport: 'livekit' as any, // Using string literal for now
    });

    const { agent_id: streamId, session_id: sessionId, session_token: token, session_url: url } = streamResponse;

    // Join the room
    await room.connect(url, token);
    log('LiveKit room joined successfully');

    analytics.enrich({
        'stream-type': StreamType.LiveKit,
    });

    return {
        speak(payload: PayloadType<T>) {
            if (!isConnected || !room) {
                throw new Error('Room is not connected');
            }

            // Send speak request via data channel
            const message = JSON.stringify({
                type: 'speak',
                payload,
            });

            room.localParticipant.publishData(new TextEncoder().encode(message), { reliable: true });

            // For now, return a mock response - this should be replaced with actual API call
            return Promise.resolve({
                duration: 0,
                video_id: '',
                status: 'success',
            });
        },

        async disconnect() {
            if (room) {
                await room.disconnect();
                room = null;
            }
            isConnected = false;
            callbacks.onAgentActivityStateChange?.(AgentActivityState.Idle);
        },

        sendDataChannelMessage(payload: string) {
            if (!isConnected || !room) {
                log('Room is not connected for sending messages');
                callbacks.onError?.(new Error('Room is not connected for sending messages'), {
                    streamId,
                });
                return;
            }

            try {
                room.localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
            } catch (e: any) {
                log('Error sending data channel message', e);
                callbacks.onError?.(e, { streamId });
            }
        },

        sessionId,
        streamId,
        streamType: StreamType.LiveKit,
        interruptAvailable: true,
    };
}

export type LiveKitStreamingManager<T extends CreateStreamOptions> = Awaited<
    ReturnType<typeof createLiveKitStreamingManager<T>>
>;
