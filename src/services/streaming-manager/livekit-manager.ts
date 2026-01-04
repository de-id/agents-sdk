import {
    AgentActivityState,
    ConnectionState,
    ConnectivityState,
    CreateSessionV2Options,
    CreateStreamOptions,
    PayloadType,
    StreamEvents,
    StreamingManagerOptions,
    StreamingState,
    StreamType,
    TransportProvider,
} from '@sdk/types';
import { ChatProgress } from '@sdk/types/entities/agents/manager';
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

enum DataChannelTopic {
    Chat = 'lk.chat',
    Speak = 'did.speak',
}

export function handleInitError(
    error: unknown,
    log: (message?: any, ...optionalParams: any[]) => void,
    callbacks: StreamingManagerOptions['callbacks'],
    markInitialConnectionDone: () => void
): void {
    log('Failed to connect to LiveKit room:', error);
    markInitialConnectionDone();
    callbacks.onConnectionStateChange?.(ConnectionState.Fail);
    callbacks.onError?.(error as Error, { sessionId: '' });
    throw error;
}

export async function createLiveKitStreamingManager<T extends CreateSessionV2Options>(
    agentId: string,
    sessionOptions: CreateSessionV2Options,
    options: StreamingManagerOptions
): Promise<StreamingManager<T>> {
    const log = createStreamingLogger(options.debug || false, 'LiveKitStreamingManager');

    const { Room, RoomEvent, ConnectionState: LiveKitConnectionState } = await importLiveKit();

    const { callbacks, auth, baseURL, analytics } = options;
    let room: Room | null = null;
    let isConnected = false;
    const streamType = StreamType.Fluent;
    let isInitialConnection = true;
    let sharedMediaStream: MediaStream | null = null;

    room = new Room({
        adaptiveStream: false, // Must be false to use mediaStreamTrack directly
        dynacast: true,
    });

    const streamApi = createStreamApiV2(auth, baseURL || didApiUrl, agentId, callbacks.onError);
    let sessionId: string | undefined;

    let token: string | undefined;
    let url: string | undefined;

    try {
        const streamResponse = await streamApi.createStream({
            transport_provider: TransportProvider.Livekit,
            chat_persist: sessionOptions.chat_persist ?? true,
        });

        const { id, session_token, session_url } = streamResponse;
        callbacks.onStreamCreated?.({ session_id: id, stream_id: id, agent_id: agentId });
        sessionId = id;
        token = session_token;
        url = session_url;

        await room.prepareConnection(url, token);
    } catch (error) {
        handleInitError(error, log, callbacks, () => {
            isInitialConnection = false;
        });
    }

    if (!url || !token || !sessionId) {
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

        const mediaStreamTrack = track.mediaStreamTrack;
        if (!mediaStreamTrack) {
            log(`No mediaStreamTrack available for ${track.kind}`);
            return;
        }

        // Create shared stream if it doesn't exist, or add track to existing stream
        if (!sharedMediaStream) {
            sharedMediaStream = new MediaStream([mediaStreamTrack]);
            log(`Created shared MediaStream with ${track.kind} track`);
        } else {
            sharedMediaStream.addTrack(mediaStreamTrack);
            log(`Added ${track.kind} track to shared MediaStream`);
        }

        if (track.kind === 'video') {
            callbacks.onSrcObjectReady?.(sharedMediaStream);
            callbacks.onVideoStateChange?.(StreamingState.Start);
        }
    }

    function handleTrackUnsubscribed(track: RemoteTrack, publication: any, participant: RemoteParticipant): void {
        log(`Track unsubscribed: ${track.kind} from ${participant.identity}`);

        if (track.kind === 'video') {
            callbacks.onVideoStateChange?.(StreamingState.Stop);
        }
    }

    function handleDataReceived(
        payload: Uint8Array,
        participant?: RemoteParticipant,
        _kind?: any,
        topic?: string
    ): void {
        const message = new TextDecoder().decode(payload);
        log('Data received:', message);

        try {
            const data = JSON.parse(message);
            const subject = topic || data.subject;

            if (subject === StreamEvents.ChatAnswer) {
                const eventName = ChatProgress.Answer;
                callbacks.onMessage?.(eventName, {
                    event: eventName,
                    ...data,
                });
            } else if ([StreamEvents.StreamVideoCreated, StreamEvents.StreamVideoDone].includes(subject)) {
                const source = data?.source || participant?.identity || 'datachannel';
                callbacks.onMessage?.(subject, {
                    [source]: data,
                });
            }
        } catch (e) {
            log('Failed to parse data channel message:', e);
        }
    }

    function handleMediaDevicesError(error: Error): void {
        log('Media devices error:', error);
        callbacks.onError?.(new Error(internalErrorMassage), { sessionId });
    }

    function handleEncryptionError(error: Error): void {
        log('Encryption error:', error);
        callbacks.onError?.(new Error(internalErrorMassage), { sessionId });
    }

    function handleTrackSubscriptionFailed(
        trackSid: string,
        participant: RemoteParticipant,
        reason?: SubscriptionError
    ): void {
        log('Track subscription failed:', { trackSid, participant, reason });
    }

    function cleanMediaStream(): void {
        if (sharedMediaStream) {
            sharedMediaStream.getTracks().forEach(track => track.stop());
            sharedMediaStream = null;
        }
    }

    async function sendTextMessage(message: string, topic: DataChannelTopic = DataChannelTopic.Chat) {
        if (!isConnected || !room) {
            log('Room is not connected for sending messages');
            callbacks.onError?.(new Error(internalErrorMassage), {
                sessionId,
            });
            return;
        }

        try {
            await room.localParticipant.sendText(message, { topic });
            log('Message sent successfully:', message);
        } catch (error) {
            log('Failed to send message:', error);
            callbacks.onError?.(new Error(internalErrorMassage), { sessionId });
        }
    }

    return {
        speak(payload: PayloadType<T>) {
            const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
            return sendTextMessage(message, DataChannelTopic.Speak);
        },

        async disconnect() {
            if (room) {
                await room.disconnect();
                room = null;
            }
            cleanMediaStream();
            isConnected = false;
            callbacks.onConnectionStateChange?.(ConnectionState.Completed);
            callbacks.onAgentActivityStateChange?.(AgentActivityState.Idle);
        },

        sendDataChannelMessage: sendTextMessage,
        sendTextMessage,

        sessionId,
        streamId: sessionId,
        streamType,
        interruptAvailable: true,
        triggersAvailable: false,
    };
}

export type LiveKitStreamingManager<T extends CreateStreamOptions> = StreamingManager<T>;
