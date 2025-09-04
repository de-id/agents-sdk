import {
    Agent,
    AgentsAPI,
    Chat,
    ChatMode,
    ConnectionState,
    CreateStreamOptions,
    CreateStreamV2Response,
    StreamScript,
    StreamType,
    Transport,
} from '$/types/index';
import { RemoteAudioTrack, RemoteParticipant, RemoteTrack, RemoteVideoTrack, Room, RoomEvent } from 'livekit-client';
import { createStreamApiV2 } from '../../../api/streams/streamsApiV2';
import { Analytics } from '../../analytics/mixpanel';
import { createChat } from '../../chat';
import { StreamingManager } from '../index';
import { ExtendedAgentManagerOptions, InitializationResult, StreamingStrategy } from './types';

const joinRoom = async (
    streamResponse: CreateStreamV2Response,
    options: ExtendedAgentManagerOptions
): Promise<Room> => {
    console.log('Joining LiveKit room:', {
        roomUrl: streamResponse.session_url,
        token: streamResponse.session_token,
        sessionId: streamResponse.session_id,
    });

    try {
        // Create LiveKit Room instance
        const room = new Room({
            // Configure room options
            adaptiveStream: true,
            dynacast: true,
        });

        // Set up room event handlers
        room.on(RoomEvent.Connected, () => {
            console.log('LiveKit room connected successfully');
            options.callbacks?.onConnectionStateChange?.(ConnectionState.Connected);
        });

        room.on(RoomEvent.Disconnected, reason => {
            console.log('LiveKit room disconnected:', reason);
            options.callbacks?.onConnectionStateChange?.(ConnectionState.Closed);
        });

        room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
            console.log('Participant connected:', participant.identity);
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
            console.log('Participant disconnected:', participant.identity);
        });

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant: RemoteParticipant) => {
            console.log('Track subscribed:', track.kind, 'from', participant.identity);

            // Handle audio tracks
            if (track instanceof RemoteAudioTrack) {
                track.attach();
                // Set up audio element for playback
                const audioElement = track.attach();
                if (audioElement) {
                    audioElement.autoplay = true;
                    audioElement.volume = 1.0;
                    document.body.appendChild(audioElement);
                }
            }

            // Handle video tracks
            if (track instanceof RemoteVideoTrack) {
                track.attach();
                // Set up video element for display
                const videoElement = track.attach();
                if (videoElement) {
                    videoElement.autoplay = true;
                    videoElement.muted = false;
                    videoElement.controls = false;
                    videoElement.style.width = '100%';
                    videoElement.style.height = 'auto';
                    document.body.appendChild(videoElement);

                    // Notify about video source ready
                    // Create a MediaStream from the video element
                    try {
                        const stream = (videoElement as any).captureStream
                            ? (videoElement as any).captureStream()
                            : null;
                        if (stream) {
                            options.callbacks?.onSrcObjectReady?.(stream);
                        }
                    } catch (error) {
                        console.warn('Could not capture stream from video element:', error);
                    }
                }
            }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication, participant: RemoteParticipant) => {
            console.log('Track unsubscribed:', track.kind, 'from', participant.identity);
            track.detach();
        });

        room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
            console.log('Data received from', participant?.identity, ':', new TextDecoder().decode(payload));
            // Handle data channel messages
            try {
                const message = new TextDecoder().decode(payload);
                const parsed = JSON.parse(message);
                // Process data channel messages similar to WebRTC implementation
                if (parsed.type === 'interrupt') {
                    // Handle interrupt
                    console.log('Interrupt received via LiveKit data channel');
                }
            } catch (error) {
                console.error('Error parsing data channel message:', error);
            }
        });

        // Connect to the room
        await room.connect(streamResponse.session_url, streamResponse.session_token);

        console.log('LiveKit room joined successfully');
        return room;
    } catch (error) {
        console.error('Failed to join LiveKit room:', error);
        throw error;
    }
};

const createLiveKitStreamingManager = async (
    streamResponse: CreateStreamV2Response,
    options: ExtendedAgentManagerOptions
): Promise<StreamingManager<CreateStreamOptions> & { room: Room }> => {
    // Join the LiveKit room and get the room instance
    const room = await joinRoom(streamResponse, options);

    return {
        streamId: streamResponse.session_id,
        sessionId: streamResponse.session_id,
        streamType: 'livekit' as any, // Cast to fit the existing enum
        interruptAvailable: true,

        async speak(payload: any): Promise<any> {
            // LiveKit specific speak implementation
            // Send data through LiveKit data channel
            try {
                const data = JSON.stringify({
                    type: 'speak',
                    payload: payload,
                });
                await room.localParticipant.publishData(new TextEncoder().encode(data));

                return {
                    duration: 0,
                    video_id: streamResponse.session_id,
                    status: 'success',
                };
            } catch (error) {
                console.error('Error sending speak request via LiveKit:', error);
                throw error;
            }
        },

        async disconnect(): Promise<void> {
            // LiveKit specific disconnect implementation
            console.log('Disconnecting from LiveKit room');
            try {
                await room.disconnect();
                console.log('LiveKit room disconnected successfully');
            } catch (error) {
                console.error('Error disconnecting from LiveKit room:', error);
            }
        },

        sendDataChannelMessage(payload: string): void {
            // LiveKit data channel implementation
            console.log('Sending LiveKit data channel message:', payload);
            try {
                room.localParticipant.publishData(new TextEncoder().encode(payload));
            } catch (error) {
                console.error('Error sending data channel message via LiveKit:', error);
            }
        },

        // LiveKit-specific properties (additional to StreamingManager)
        roomToken: streamResponse.session_token,
        roomUrl: streamResponse.session_url,
        room: room, // Store the room instance for direct access
    } as StreamingManager<CreateStreamOptions> & { room: Room };
};

export const createLiveKitStrategy = (): StreamingStrategy => ({
    async initializeStreamAndChat(
        agentEntity: Agent,
        options: ExtendedAgentManagerOptions,
        agentsApi: AgentsAPI,
        analytics: Analytics,
        existingChat?: Chat
    ): Promise<InitializationResult> {
        // Create V2 stream API instance
        const streamApiV2 = createStreamApiV2(
            options.auth,
            options.baseURL!, // TODO add v2 to agents API
            agentEntity.id,
            options.callbacks.onError
        );

        const streamResponse = await streamApiV2.createStream({
            transport: Transport.Livekit,
        });

        // Initialize chat
        //TODO use from createStream
        const chatResult =
            existingChat ||
            (await createChat(
                agentEntity,
                agentsApi,
                analytics,
                options.mode || ChatMode.Functional,
                options.persistentChat
            ));

        // Create LiveKit streaming manager that conforms to StreamingManager interface
        const streamingManager = await createLiveKitStreamingManager(streamResponse, options);

        return {
            streamingManager,
            chat: typeof chatResult === 'object' && 'chat' in chatResult ? chatResult.chat : chatResult,
        };
    },

    validateSpeakRequest(streamingManager: StreamingManager<CreateStreamOptions>, chatMode: ChatMode): void {
        if (!streamingManager) {
            throw new Error('Please connect to the agent first (LiveKit)');
        }
        const liveKitManager = streamingManager as any;
        if (!liveKitManager.roomToken) {
            throw new Error('LiveKit room not initialized');
        }
    },

    async speak(
        streamingManager: StreamingManager<CreateStreamOptions>,
        script: StreamScript,
        metadata: { chat_id?: string; agent_id: string }
    ): Promise<any> {
        return streamingManager.speak({
            script,
            metadata,
        });
    },

    validateInterrupt(
        streamingManager: StreamingManager<CreateStreamOptions>,
        streamType: StreamType | undefined,
        videoId: string | null
    ): void {
        if (!streamingManager || !streamingManager.interruptAvailable) {
            throw new Error('Interrupt not available in LiveKit mode');
        }
        // For LiveKit, we use our own validation since it's not in the StreamType enum
        const liveKitManager = streamingManager as any;
        if (liveKitManager.streamType !== 'livekit') {
            throw new Error('Invalid stream type for LiveKit interrupt');
        }
    },

    interrupt(streamingManager: StreamingManager<CreateStreamOptions>, videoId: string | null): void {
        // LiveKit specific interrupt handling
        const liveKitManager = streamingManager as any;
        if (liveKitManager.room) {
            // Send interrupt via LiveKit data channel
            const interruptData = JSON.stringify({
                type: 'interrupt',
                videoId: videoId,
                timestamp: Date.now(),
            });
            liveKitManager.room.localParticipant.publishData(new TextEncoder().encode(interruptData));
        } else {
            // Fallback to data channel message for interrupt
            streamingManager.sendDataChannelMessage(JSON.stringify({ type: 'interrupt' }));
        }
    },
});
