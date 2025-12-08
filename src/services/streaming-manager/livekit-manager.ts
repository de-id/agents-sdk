import {
    AgentActivityState,
    ConnectionState,
    ConnectivityState,
    CreateStreamOptions,
    CreateStreamV2Options,
    PayloadType,
    StreamEvents,
    StreamingManagerOptions,
    StreamingState,
    StreamType,
    TransportProvider,
} from '@sdk/types';
import { createStreamApiV2 } from '../../api/streams/streamsApiV2';
import { didApiUrl } from '../../config/environment';
import { createStreamingLogger, StreamingManager } from './common';

import type {
    ConnectionState as LiveKitConnectionState,
    RemoteParticipant,
    RemoteTrack,
    Room,
    RoomEvent,
} from 'livekit-client';

async function importLiveKit(): Promise<{
    Room: typeof Room;
    RoomEvent: typeof RoomEvent;
    ConnectionState: typeof LiveKitConnectionState;
    RemoteParticipant: typeof RemoteParticipant;
    RemoteTrack: typeof RemoteTrack;
}> {
    try {
        return await import('livekit-client');
    } catch (error) {
        throw new Error(
            'LiveKit client is required for this streaming manager. Please install it using: npm install livekit-client'
        );
    }
}

function attachHiddenElement(track: RemoteTrack, attachedElements: HTMLMediaElement[]): HTMLMediaElement {
    const hiddenElement = track.attach();
    attachedElements.push(hiddenElement);
    hiddenElement.style.position = 'absolute';
    hiddenElement.style.width = '1px';
    hiddenElement.style.height = '1px';
    hiddenElement.style.opacity = '0.01';
    hiddenElement.style.pointerEvents = 'none';
    hiddenElement.muted = true;
    return hiddenElement;
}

export async function createLiveKitStreamingManager<T extends CreateStreamV2Options>(
    agentId: string,
    agent: T,
    options: StreamingManagerOptions
): Promise<StreamingManager<T>> {
    const log = createStreamingLogger(options.debug || false, 'LiveKitStreamingManager');

    const {
        Room,
        RoomEvent,
        ConnectionState: LiveKitConnectionState,
        RemoteParticipant,
        RemoteTrack,
    } = await importLiveKit();

    const { callbacks, auth, baseURL, analytics } = options;
    let room: Room | null = null;
    let isConnected = false;
    let videoId: string | null = null;
    let mediaStream: MediaStream | null = null;
    const streamType = StreamType.Fluent;
    let isInitialConnection = true;
    // Store attached elements to prevent garbage collection
    const attachedElements: HTMLMediaElement[] = [];
    let videoElement: HTMLVideoElement | null = null;

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

    room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        if (participant?.isLocal && quality === 'poor') {
            log('Connection quality is poor');
            callbacks.onConnectivityStateChange?.(ConnectivityState.Weak);
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
            const hiddenElement = attachHiddenElement(track, attachedElements);
            document.body.appendChild(hiddenElement);

            // Play the hidden element to keep the track "alive"
            hiddenElement
                .play()
                .then(() => {
                    log('Hidden video element playing');
                })
                .catch(e => log('Error playing hidden element:', e));

            log(`Video element created, srcObject: ${hiddenElement.srcObject}`);

            if (hiddenElement.srcObject) {
                callbacks.onSrcObjectReady?.(hiddenElement.srcObject as MediaStream);
            }
        }

        if (track.kind === 'audio') {
            // For audio, create element and play it directly
            const audioElement = track.attach();
            attachedElements.push(audioElement);
            audioElement.style.display = 'none';
            document.body.appendChild(audioElement);
            audioElement.play().catch(e => log('Error playing audio element:', e));
        }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication, participant: RemoteParticipant) => {
        log(`Track unsubscribed: ${track.kind} from ${participant.identity}`);

        if (track.kind === 'video') {
            callbacks.onVideoStateChange?.(StreamingState.Stop);
        }
    });

    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        const message = new TextDecoder().decode(payload);
        log('Data received:', message);

        try {
            const data = JSON.parse(message);
            if (data.subject === StreamEvents.StreamStarted && data.metadata?.videoId) {
                videoId = data.metadata.videoId;
                callbacks.onVideoIdChange?.(videoId);
                callbacks.onAgentActivityStateChange?.(AgentActivityState.Talking);
            } else if (data.subject === StreamEvents.StreamDone) {
                videoId = null;
                callbacks.onVideoIdChange?.(videoId);
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
            transport_provider: TransportProvider.Livekit,
            chat_id: agent.chat_id,
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

    function cleanDomElements(): void {
        attachedElements.forEach(el => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        attachedElements.length = 0;
    }

    async function sendTextMessage(message: string) {
        if (!isConnected || !room) {
            log('Room is not connected for sending messages');
            callbacks.onError?.(new Error('Room is not connected for sending messages'), {
                streamId,
            });
            return;
        }

        try {
            await room.localParticipant.publishData(new TextEncoder().encode(message), { reliable: true });
        } catch (e: any) {
            log('Error sending data channel message', e);
            callbacks.onError?.(e, { streamId });
        }
    }

    return {
        speak(payload: PayloadType<T>) {
            const message = JSON.stringify({
                type: 'speak',
                payload,
            });

            return sendDataChannelMessage(message);
        },

        async disconnect() {
            if (room) {
                await room.disconnect();
                room = null;
            }
            cleanDomElements();
            isConnected = false;
            callbacks.onConnectionStateChange?.(ConnectionState.Completed);
            callbacks.onAgentActivityStateChange?.(AgentActivityState.Idle);
        },

        sendDataChannelMessage,

        sessionId,
        streamId,
        streamType,
        interruptAvailable: true,
        triggersAvailable: false,
    };
}

export type LiveKitStreamingManager<T extends CreateStreamOptions> = StreamingManager<T>;
