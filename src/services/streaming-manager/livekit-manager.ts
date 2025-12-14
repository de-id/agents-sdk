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
    ConnectionQuality,
    ConnectionState as LiveKitConnectionState,
    Participant,
    RemoteParticipant,
    RemoteTrack,
    Room,
    RoomEvent,
    SubscriptionError,
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

const connectivityQualityToState = {
    excellent: ConnectivityState.Strong,
    good: ConnectivityState.Strong,
    poor: ConnectivityState.Weak,
    lost: ConnectivityState.Unknown,
    unknown: ConnectivityState.Unknown,
};

const internalErrorMassage = JSON.stringify({
    kind: 'InternalServerError',
    description: 'Stream Error',
});

export function handleInitError(
    error: unknown,
    log: (message?: any, ...optionalParams: any[]) => void,
    callbacks: StreamingManagerOptions['callbacks'],
    markInitialConnectionDone: () => void
): void {
    log('Failed to connect to LiveKit room:', error);
    markInitialConnectionDone();
    callbacks.onConnectionStateChange?.(ConnectionState.Fail);
    callbacks.onError?.(error as Error, { streamId: '' });
    throw error;
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
    const streamType = StreamType.Fluent;
    let isInitialConnection = true;
    const attachedElements: HTMLMediaElement[] = [];

    room = new Room({
        adaptiveStream: true,
        dynacast: true,
    });

    const streamApi = createStreamApiV2(auth, baseURL || didApiUrl, agentId, callbacks.onError);
    let streamId: string | undefined;
    let sessionId: string | undefined;

    let token: string | undefined;
    let url: string | undefined;

    try {
        const streamResponse = await streamApi.createStream({
            transport_provider: TransportProvider.Livekit,
            chat_id: agent.chat_id,
        });

        const { session_id, session_token, session_url } = streamResponse;
        callbacks.onStreamCreated?.({ stream_id: session_id, session_id, agent_id: agentId });
        streamId = session_id;
        sessionId = session_id;
        token = session_token;
        url = session_url;

        await room.prepareConnection(url, token);
    } catch (error) {
        handleInitError(error, log, callbacks, () => {
            isInitialConnection = false;
        });
    }

    if (!url || !token || !streamId || !sessionId) {
        return Promise.reject(new Error('Failed to initialize LiveKit stream'));
    }

    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged)
        .on(RoomEvent.ConnectionQualityChanged, handleConnectionQualityChanged)
        .on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged)
        .on(RoomEvent.ParticipantConnected, handleParticipantConnected)
        .on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
        .on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
        .on(RoomEvent.DataReceived, handleDataReceived)
        .on(RoomEvent.MediaDevicesError, handleMediaDevicesError)
        .on(RoomEvent.EncryptionError, handleEncryptionError)
        .on(RoomEvent.TrackSubscriptionFailed, handleTrackSubscriptionFailed);

    callbacks.onConnectionStateChange?.(ConnectionState.New);

    try {
        await room.connect(url, token);
        log('LiveKit room joined successfully');

        isInitialConnection = false;
    } catch (error) {
        handleInitError(error, log, callbacks, () => {
            isInitialConnection = false;
        });
    }

    analytics.enrich({
        'stream-type': streamType,
    });

    function handleConnectionStateChanged(state: LiveKitConnectionState): void {
        log('Connection state changed:', state);
        switch (state) {
            case LiveKitConnectionState.Connecting:
                callbacks.onConnectionStateChange?.(ConnectionState.Connecting);
                break;
            case LiveKitConnectionState.Connected:
                log('LiveKit room connected successfully');
                isConnected = true;
                // During initial connection, defer the callback to ensure manager is returned first
                if (isInitialConnection) {
                    queueMicrotask(() => {
                        callbacks.onConnectionStateChange?.(ConnectionState.Connected);
                    });
                } else {
                    callbacks.onConnectionStateChange?.(ConnectionState.Connected);
                }
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
    }

    function handleConnectionQualityChanged(quality: ConnectionQuality, participant?: Participant): void {
        log('Connection quality:', quality);
        if (participant?.isLocal) {
            callbacks.onConnectivityStateChange?.(connectivityQualityToState[quality]);
        }
    }

    function handleActiveSpeakersChanged(activeSpeakers: Participant[]): void {
        log('Active speakers changed:', activeSpeakers);
        const activeSpeaker = activeSpeakers[0];
        if (activeSpeaker) {
            callbacks.onAgentActivityStateChange?.(AgentActivityState.Talking);
        } else {
            callbacks.onAgentActivityStateChange?.(AgentActivityState.Idle);
        }
    }

    function handleParticipantConnected(participant: RemoteParticipant): void {
        log('Participant connected:', participant.identity);
    }

    function handleTrackSubscribed(track: RemoteTrack, publication: any, participant: RemoteParticipant): void {
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
                callbacks.onVideoStateChange?.(StreamingState.Start);
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
    }

    function handleTrackUnsubscribed(track: RemoteTrack, publication: any, participant: RemoteParticipant): void {
        log(`Track unsubscribed: ${track.kind} from ${participant.identity}`);

        if (track.kind === 'video') {
            callbacks.onVideoStateChange?.(StreamingState.Stop);
        }
    }

    function handleDataReceived(payload: Uint8Array, participant?: RemoteParticipant): void {
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
    }

    function handleMediaDevicesError(error: Error): void {
        log('Media devices error:', error);
        callbacks.onError?.(new Error(internalErrorMassage), { streamId });
    }

    function handleEncryptionError(error: Error): void {
        log('Encryption error:', error);
        callbacks.onError?.(new Error(internalErrorMassage), { streamId });
    }

    function handleTrackSubscriptionFailed(
        trackSid: string,
        participant: RemoteParticipant,
        reason?: SubscriptionError
    ): void {
        log('Track subscription failed:', { trackSid, participant, reason });
    }

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
            callbacks.onError?.(new Error(internalErrorMassage), {
                streamId,
            });
            return;
        }

        try {
            await room.localParticipant.sendText(message, {
                topic: 'lk.chat',
            });
            log('Message sent successfully:', message);
        } catch (error) {
            log('Failed to send message:', error);
            callbacks.onError?.(new Error(internalErrorMassage), { streamId });
        }
    }

    return {
        speak(payload: PayloadType<T>) {
            const message = JSON.stringify({
                type: 'speak',
                payload,
            });

            return sendTextMessage(message);
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

        sendDataChannelMessage: sendTextMessage,
        sendTextMessage,

        sessionId,
        streamId,
        streamType,
        interruptAvailable: true,
        triggersAvailable: false,
    };
}

export type LiveKitStreamingManager<T extends CreateStreamOptions> = StreamingManager<T>;
