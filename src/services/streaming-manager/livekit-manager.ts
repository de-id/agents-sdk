import {
    AgentActivityState,
    ConnectionState,
    ConnectivityState,
    CreateSessionV2Options,
    CreateStreamOptions,
    Message,
    PayloadType,
    StreamEvents,
    StreamingManagerOptions,
    StreamingState,
    StreamType,
    TransportProvider,
} from '@sdk/types';
import { ChatProgress } from '@sdk/types/entities/agents/manager';
import { noop } from '@sdk/utils';
import { createStreamApiV2 } from '../../api/streams/streamsApiV2';
import { didApiUrl } from '../../config/environment';
import { latencyTimestampTracker } from '../analytics/timestamp-tracker';
import { createStreamingLogger, StreamingManager } from './common';

import type {
    ConnectionQuality,
    ConnectionState as LiveKitConnectionState,
    LocalTrackPublication,
    Participant,
    RemoteParticipant,
    RemoteTrack,
    Room,
    RoomEvent,
    SubscriptionError,
    Track,
    TranscriptionSegment,
} from 'livekit-client';
import { createVideoStatsMonitor } from './stats/poll';

async function importLiveKit(): Promise<{
    Room: typeof Room;
    RoomEvent: typeof RoomEvent;
    ConnectionState: typeof LiveKitConnectionState;
    RemoteParticipant: typeof RemoteParticipant;
    RemoteTrack: typeof RemoteTrack;
    Track: typeof Track;
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

export enum DataChannelTopic {
    Chat = 'lk.chat',
    Speak = 'did.speak',
    Interrupt = 'did.interrupt',
}

type VideoMessageData = Pick<Message, 'role' | 'sentiment'>;

export function handleInitError(
    error: unknown,
    log: (message?: any, ...optionalParams: any[]) => void,
    callbacks: StreamingManagerOptions['callbacks']
): void {
    log('Failed to connect to LiveKit room:', error);
    callbacks.onConnectionStateChange?.(ConnectionState.Fail, 'internal:init-error');
    callbacks.onError?.(error as Error, { sessionId: '' });
    throw error;
}

export async function createLiveKitStreamingManager<T extends CreateSessionV2Options>(
    agentId: string,
    sessionOptions: CreateSessionV2Options,
    options: StreamingManagerOptions
): Promise<StreamingManager<T> & { reconnect(): Promise<void> }> {
    const log = createStreamingLogger(options.debug || false, 'LiveKitStreamingManager');

    const { Room, RoomEvent, ConnectionState: LiveKitConnectionState } = await importLiveKit();

    const { callbacks, auth, baseURL, analytics, microphoneStream } = options;
    let room: Room | null = null;
    let isConnected = false;
    const streamType = StreamType.Fluent;
    let sharedMediaStream: MediaStream | null = null;
    let microphonePublication: LocalTrackPublication | null = null;
    let videoStatsMonitor: ReturnType<typeof createVideoStatsMonitor> | null = null;
    // We defer Connected until video track is subscribed to align with WebRTC behavior
    let hasEmittedConnected = false;

    room = new Room({
        adaptiveStream: false, // Must be false to use mediaStreamTrack directly
        dynacast: true,
    });

    let trackSubscriptionTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const TRACK_SUBSCRIPTION_TIMEOUT_MS = 20000;
    let currentActivityState: AgentActivityState = AgentActivityState.Idle;

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
        handleInitError(error, log, callbacks);
    }

    if (!url || !token || !sessionId) {
        return Promise.reject(new Error('Failed to initialize LiveKit stream'));
    }

    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged)
        .on(RoomEvent.ConnectionQualityChanged, handleConnectionQualityChanged)
        .on(RoomEvent.ParticipantConnected, handleParticipantConnected)
        .on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
        .on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
        .on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
        .on(RoomEvent.DataReceived, handleDataReceived)
        .on(RoomEvent.MediaDevicesError, handleMediaDevicesError)
        .on(RoomEvent.TranscriptionReceived, handleTranscriptionReceived)
        .on(RoomEvent.EncryptionError, handleEncryptionError)
        .on(RoomEvent.TrackSubscriptionFailed, handleTrackSubscriptionFailed);

    function handleTranscriptionReceived(_segments: TranscriptionSegment[], participant?: Participant): void {
        if (participant?.isLocal) {
            latencyTimestampTracker.update();
            if (currentActivityState === AgentActivityState.Talking) {
                callbacks.onInterruptDetected?.({ type: 'audio' });
                currentActivityState = AgentActivityState.Idle;
            }
        }
    }
    try {
        await room.connect(url, token);
        log('LiveKit room joined successfully');

        trackSubscriptionTimeoutId = setTimeout(() => {
            log('Track subscription timeout - no track subscribed within 30 seconds after connect');
            trackSubscriptionTimeoutId = null;
            analytics.track('connectivity-error', {
                error: 'Track subscription timeout',
                sessionId,
            });
            callbacks.onError?.(new Error('Track subscription timeout'), { sessionId });
            disconnect('internal:track-subscription-timeout');
        }, TRACK_SUBSCRIPTION_TIMEOUT_MS);
    } catch (error) {
        handleInitError(error, log, callbacks);
    }

    analytics.enrich({
        'stream-type': streamType,
    });

    function handleConnectionStateChanged(state: LiveKitConnectionState): void {
        log('Connection state changed:', state);
        switch (state) {
            case LiveKitConnectionState.Connecting:
                log('CALLBACK: onConnectionStateChange(Connecting)');
                callbacks.onConnectionStateChange?.(ConnectionState.Connecting, 'livekit:connecting');
                break;
            case LiveKitConnectionState.Connected:
                log('LiveKit room connected successfully');
                isConnected = true;
                break;
            case LiveKitConnectionState.Disconnected:
                log('LiveKit room disconnected');
                isConnected = false;
                hasEmittedConnected = false;
                callbacks.onConnectionStateChange?.(ConnectionState.Disconnected, 'livekit:disconnected');
                break;
            case LiveKitConnectionState.Reconnecting:
                log('LiveKit room reconnecting...');
                callbacks.onConnectionStateChange?.(ConnectionState.Connecting, 'livekit:reconnecting');
                break;
            case LiveKitConnectionState.SignalReconnecting:
                log('LiveKit room signal reconnecting...');
                callbacks.onConnectionStateChange?.(ConnectionState.Connecting, 'livekit:signal-reconnecting');
                break;
        }
    }

    function handleConnectionQualityChanged(quality: ConnectionQuality, participant?: Participant): void {
        log('Connection quality:', quality);
        if (participant?.isLocal) {
            callbacks.onConnectivityStateChange?.(connectivityQualityToState[quality]);
        }
    }

    function handleParticipantConnected(participant: RemoteParticipant): void {
        log('Participant connected:', participant.identity);
    }

    function handleParticipantDisconnected(participant: RemoteParticipant): void {
        log('Participant disconnected:', participant.identity);

        // Agent left the room - treat as disconnect
        disconnect('livekit:participant-disconnected');
    }

    function handleTrackSubscribed(track: RemoteTrack, publication: any, participant: RemoteParticipant): void {
        log(`Track subscribed: ${track.kind} from ${participant.identity}`);

        if (trackSubscriptionTimeoutId) {
            clearTimeout(trackSubscriptionTimeoutId);
            trackSubscriptionTimeoutId = null;
            log('Track subscription timeout cleared');
        }

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
            callbacks.onStreamReady?.();
            log('CALLBACK: onSrcObjectReady');
            callbacks.onSrcObjectReady?.(sharedMediaStream);
            if (!hasEmittedConnected) {
                hasEmittedConnected = true;
                log('CALLBACK: onConnectionStateChange(Connected)');
                callbacks.onConnectionStateChange?.(ConnectionState.Connected, 'livekit:track-subscribed');
            }
            log('CALLBACK: onVideoStateChange(Start)');
            callbacks.onVideoStateChange?.(StreamingState.Start);
            videoStatsMonitor = createVideoStatsMonitor(
                () => track.getRTCStatsReport(),
                () => isConnected,
                noop,
                (state, _report) => {
                    log(`Video state change: ${state}`);
                }
            );
            videoStatsMonitor.start();
        }
    }

    function handleTrackUnsubscribed(track: RemoteTrack, publication: any, participant: RemoteParticipant): void {
        log(`Track unsubscribed: ${track.kind} from ${participant.identity}`);

        if (track.kind === 'video') {
            const report = videoStatsMonitor?.getReport();
            videoStatsMonitor?.stop();
            videoStatsMonitor = null;

            callbacks.onVideoStateChange?.(StreamingState.Stop, report);
        }
    }

    function handleDataReceived(
        payload: Uint8Array,
        participant?: RemoteParticipant,
        _kind?: any,
        topic?: string
    ): void {
        const message = new TextDecoder().decode(payload);

        try {
            const data = JSON.parse(message);
            const subject = topic || data.subject;
            log('Data received:', { subject, data });

            if (subject === StreamEvents.ChatAnswer) {
                const eventName = ChatProgress.Answer;
                callbacks.onMessage?.(eventName, {
                    event: eventName,
                    ...data,
                });
            } else if (subject === StreamEvents.ChatPartial) {
                const eventName = ChatProgress.Partial;
                callbacks.onMessage?.(eventName, {
                    event: eventName,
                    ...data,
                });
            } else if (
                [
                    StreamEvents.StreamVideoCreated,
                    StreamEvents.StreamVideoDone,
                    StreamEvents.StreamVideoError,
                    StreamEvents.StreamVideoRejected,
                ].includes(subject)
            ) {
                currentActivityState =
                    subject === StreamEvents.StreamVideoCreated ? AgentActivityState.Talking : AgentActivityState.Idle;
                callbacks.onAgentActivityStateChange?.(currentActivityState);

                const { role: providedRole, status: providedStatus, ...payload } = data;

                const role = providedRole ?? participant?.identity ?? 'datachannel';
                const status = providedStatus ?? subject.split('/').pop() ?? 'unknown';
                const messageData: VideoMessageData = { [role]: { ...payload, status } };

                if (options.debug && data?.metadata?.sentiment) {
                    messageData.sentiment = {
                        id: data.metadata.sentiment.id,
                        name: data.metadata.sentiment.sentiment,
                    };
                }

                callbacks.onMessage?.(subject, messageData);
            } else if (subject === StreamEvents.ChatAudioTranscribed) {
                const eventName = ChatProgress.Transcribe;
                callbacks.onMessage?.(eventName, {
                    event: eventName,
                    ...data,
                });
                // Set loading state after transcribed message is processed (similar to v1)
                // Use queueMicrotask to ensure message is added before setting loading state
                queueMicrotask(() => {
                    callbacks.onAgentActivityStateChange?.(AgentActivityState.Loading);
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

    async function findPublishedMicrophoneTrack(audioTrack: MediaStreamTrack): Promise<LocalTrackPublication | null> {
        if (!room) return null;

        const { Track } = await importLiveKit();
        const publishedTracks = room.localParticipant.audioTrackPublications;

        if (publishedTracks) {
            for (const [_, publication] of publishedTracks) {
                if (publication.source === Track.Source.Microphone && publication.track) {
                    const publishedTrack = publication.track;
                    const publishedMediaTrack = publishedTrack.mediaStreamTrack;
                    if (
                        publishedMediaTrack === audioTrack ||
                        (publishedMediaTrack && publishedMediaTrack.id === audioTrack.id)
                    ) {
                        return publication as LocalTrackPublication;
                    }
                }
            }
        }

        return null;
    }

    function hasDifferentMicrophoneTrackPublished(audioTrack: MediaStreamTrack): boolean {
        if (!microphonePublication || !microphonePublication.track) {
            return false;
        }

        const publishedMediaTrack = microphonePublication.track.mediaStreamTrack;
        return publishedMediaTrack !== audioTrack && publishedMediaTrack?.id !== audioTrack.id;
    }

    async function publishMicrophoneStream(stream: MediaStream): Promise<void> {
        if (!isConnected || !room) {
            log('Room is not connected, cannot publish microphone stream');
            throw new Error('Room is not connected');
        }

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            log('No audio track found in the provided MediaStream');
            return;
        }

        const audioTrack = audioTracks[0];
        const { Track } = await importLiveKit();

        const existingPublication = await findPublishedMicrophoneTrack(audioTrack);
        if (existingPublication) {
            log('Microphone track is already published, skipping', {
                trackId: audioTrack.id,
                publishedTrackId: existingPublication.track?.mediaStreamTrack?.id,
            });
            microphonePublication = existingPublication;
            return;
        }

        if (hasDifferentMicrophoneTrackPublished(audioTrack)) {
            log('Unpublishing existing microphone track before publishing new one');
            await unpublishMicrophoneStream();
        }

        log('Publishing microphone track from provided MediaStream', { trackId: audioTrack.id });

        try {
            microphonePublication = await room.localParticipant.publishTrack(audioTrack, {
                source: Track.Source.Microphone,
            });
            log('Microphone track published successfully', { trackSid: microphonePublication.trackSid });
        } catch (error) {
            log('Failed to publish microphone track:', error);
            throw error;
        }
    }

    async function unpublishMicrophoneStream(): Promise<void> {
        if (!microphonePublication || !microphonePublication.track) {
            return;
        }

        try {
            if (room) {
                await room.localParticipant.unpublishTrack(microphonePublication.track);
                log('Microphone track unpublished');
            }
        } catch (error) {
            log('Error unpublishing microphone track:', error);
        } finally {
            microphonePublication = null;
        }
    }

    function cleanMediaStream(): void {
        if (sharedMediaStream) {
            sharedMediaStream.getTracks().forEach(track => track.stop());
            sharedMediaStream = null;
        }
    }

    async function sendMessage(message: string, topic: DataChannelTopic) {
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

    async function sendDataChannelMessage(payload: string) {
        try {
            const parsed = JSON.parse(payload);
            const topic = parsed.topic;
            return sendMessage('', topic);
        } catch (error) {
            log('Failed to send data channel message:', error);
            callbacks.onError?.(new Error(internalErrorMassage), { sessionId });
        }
    }

    function sendTextMessage(message: string) {
        return sendMessage(message, DataChannelTopic.Chat);
    }

    async function disconnect(reason: string) {
        if (trackSubscriptionTimeoutId) {
            clearTimeout(trackSubscriptionTimeoutId);
            trackSubscriptionTimeoutId = null;
        }

        if (room) {
            await unpublishMicrophoneStream();
            callbacks.onConnectionStateChange?.(ConnectionState.Disconnecting, reason);
            await room.disconnect();
        }
        cleanMediaStream();
        isConnected = false;
        hasEmittedConnected = false;
        callbacks.onAgentActivityStateChange?.(AgentActivityState.Idle);
        currentActivityState = AgentActivityState.Idle;
    }

    return {
        speak(payload: PayloadType<T>) {
            const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
            return sendMessage(message, DataChannelTopic.Speak);
        },

        disconnect: () => disconnect('user:disconnect'),

        async reconnect() {
            if (room?.state === LiveKitConnectionState.Connected) {
                log('Room is already connected');
                return;
            }

            if (!room || !url || !token) {
                log('Cannot reconnect: missing room, URL or token');
                throw new Error('Cannot reconnect: session not available');
            }

            log('Reconnecting to LiveKit room, state:', room.state);
            hasEmittedConnected = false;
            callbacks.onConnectionStateChange?.(ConnectionState.Connecting, 'user:reconnect');

            try {
                await room.connect(url, token);
                log('Room reconnected');
                isConnected = true;

                // If no remote participants, wait for agent to join
                if (room.remoteParticipants.size === 0) {
                    log('Waiting for agent to join...');

                    const agentJoined = await new Promise<boolean>(resolve => {
                        const timeout = setTimeout(() => {
                            room?.off(RoomEvent.ParticipantConnected, onParticipantConnected);
                            resolve(false);
                        }, 5000);

                        const onParticipantConnected = () => {
                            clearTimeout(timeout);
                            room?.off(RoomEvent.ParticipantConnected, onParticipantConnected);
                            resolve(true);
                        };

                        room?.on(RoomEvent.ParticipantConnected, onParticipantConnected);
                    });

                    if (!agentJoined) {
                        log('Agent did not join within timeout');
                        await room.disconnect();
                        throw new Error('Agent did not rejoin the room');
                    }

                    log('Agent joined, reconnection successful');
                }
            } catch (error) {
                log('Failed to reconnect:', error);
                callbacks.onConnectionStateChange?.(ConnectionState.Fail, 'user:reconnect-failed');
                throw error;
            }
        },

        sendDataChannelMessage,
        sendTextMessage,
        publishMicrophoneStream,
        unpublishMicrophoneStream,

        sessionId,
        streamId: sessionId,
        streamType,
        interruptAvailable: true,
        triggersAvailable: false,
    };
}

export type LiveKitStreamingManager<T extends CreateStreamOptions> = StreamingManager<T> & {
    reconnect(): Promise<void>;
};
