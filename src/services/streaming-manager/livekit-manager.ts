import {
    AgentActivityState,
    ConnectionState,
    CreateStreamOptions,
    PayloadType,
    StreamingManagerOptions,
    StreamingState,
    StreamType,
    Transport,
} from '$/types';
import {
    ConnectionState as LiveKitConnectionState,
    RemoteAudioTrack,
    RemoteParticipant,
    RemoteTrack,
    RemoteVideoTrack,
    Room,
    RoomEvent,
} from 'livekit-client';
import { createStreamApiV2 } from '../../api/streams/streamsApiV2';
import { didApiUrl } from '../../config/environment';
import { createStreamingLogger, StreamingManager } from './common';

export async function createLiveKitStreamingManager<T extends CreateStreamOptions>(
    agentId: string,
    agent: T,
    options: StreamingManagerOptions
): Promise<StreamingManager<T>> {
    const log = createStreamingLogger(options.debug || false, 'LiveKitStreamingManager');

    const { callbacks, auth, baseURL, analytics } = options;
    let room: Room | null = null;
    let isConnected = false;
    let videoId: string | null = null;
    const streamType = StreamType.Fluent;

    room = new Room({
        adaptiveStream: true,
        dynacast: true,
    });

    room.on(RoomEvent.ConnectionStateChanged, state => {
        log('Connection state changed:', state);
        switch (state) {
            case LiveKitConnectionState.Connecting:
                callbacks.onConnectionStateChange?.(ConnectionState.Connecting);
                break;
            case LiveKitConnectionState.Connected:
                log('LiveKit room connected successfully');
                isConnected = true;
                callbacks.onConnectionStateChange?.(ConnectionState.Connected);
                break;
            case LiveKitConnectionState.Disconnected:
                log('LiveKit room disconnected');
                isConnected = false;
                callbacks.onConnectionStateChange?.(ConnectionState.Disconnected);
                break;
            case LiveKitConnectionState.Reconnecting:
                log('LiveKit room reconnecting...');
                callbacks.onConnectionStateChange?.(ConnectionState.Connecting);
                break;
            case LiveKitConnectionState.SignalReconnecting:
                log('LiveKit room signal reconnecting...');
                callbacks.onConnectionStateChange?.(ConnectionState.Connecting);
                break;
        }
    });

    // Handle connection errors
    room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        if (participant?.isLocal && quality === 'poor') {
            log('Connection quality is poor');
        }
    });

    // Handle room closure - this would be handled by the server or other means
    // For now, we'll handle Closed state in disconnect method

    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        log('Participant connected:', participant.identity);
    });

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant: RemoteParticipant) => {
        log(`Track subscribed: ${track.kind} from ${participant.identity}`);

        if (track.kind === 'video') {
            const videoTrack = track as RemoteVideoTrack;
            const mediaStream = new MediaStream([videoTrack.mediaStreamTrack]);
            callbacks.onSrcObjectReady?.(mediaStream);
        } else if (track.kind === 'audio') {
            const audioTrack = track as RemoteAudioTrack;
            const mediaStream = new MediaStream([audioTrack.mediaStreamTrack]);
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

    callbacks.onConnectionStateChange?.(ConnectionState.New);

    const streamApi = createStreamApiV2(auth, baseURL || didApiUrl, agentId, callbacks.onError);
    let streamId: string;
    let sessionId: string;

    try {
        const streamResponse = await streamApi.createStream({
            transport: Transport.Livekit,
        });

        const { agent_id, session_id, session_token: token, session_url: url } = streamResponse;
        streamId = agent_id;
        sessionId = session_id;

        await room.connect(url, token);
        log('LiveKit room joined successfully');
    } catch (error) {
        log('Failed to connect to LiveKit room:', error);
        callbacks.onConnectionStateChange?.(ConnectionState.Fail);
        callbacks.onError?.(error as Error, { streamId: '' });
        throw error;
    }

    analytics.enrich({
        'stream-type': streamType,
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
            callbacks.onConnectionStateChange?.(ConnectionState.Completed);
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
        streamType,
        interruptAvailable: true,
    };
}

export type LiveKitStreamingManager<T extends CreateStreamOptions> = StreamingManager<T>;
