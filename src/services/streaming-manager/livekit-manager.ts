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
    ToolCallDonePayload,
    ToolCallErrorPayload,
    ToolCallStartedPayload,
} from '@sdk/types';
import { ChatProgress } from '@sdk/types/entities/agents/manager';
import { noop } from '@sdk/utils';
import { createStreamApiV2 } from '../../api/streams/streamsApiV2';
import { didApiUrl } from '../../config/environment';
import { latencyTimestampTracker } from '../analytics/timestamp-tracker';
import { createStreamingLogger, StreamingManager } from './common';
import { chatEventMap } from './data-channel-handlers';

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
import { createAudioStatsDetector, createVideoStatsMonitor } from './stats/poll';
import { VideoRTCStatsReport } from './stats/report';

const TRACK_SUBSCRIPTION_TIMEOUT_MS = 20000;

interface TrackPublishState {
    isPublishing: boolean;
    publication: LocalTrackPublication | null;
}

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

    const { Room, RoomEvent, ConnectionState: LiveKitConnectionState, Track } = await importLiveKit();

    const { callbacks, auth, baseURL, analytics } = options;
    let room: Room | null = null;
    let isConnected = false;
    const streamType = StreamType.Fluent;
    let sharedMediaStream: MediaStream | null = null;
    const microphoneState: TrackPublishState = { isPublishing: false, publication: null };
    const cameraState: TrackPublishState = { isPublishing: false, publication: null };
    let videoStatsMonitor: ReturnType<typeof createVideoStatsMonitor> | null = null;
    let audioStatsDetector: ReturnType<typeof createAudioStatsDetector> | null = null;
    let videoStreamingState: StreamingState | null = null;
    // We defer Connected until video track is subscribed to align with WebRTC behavior
    let hasEmittedConnected = false;

    room = new Room({
        adaptiveStream: false, // Must be false to use mediaStreamTrack directly
        dynacast: true,
    });

    let trackSubscriptionTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let currentActivityState: AgentActivityState = AgentActivityState.Idle;
    let currentInterruptible = true;

    const streamApi = createStreamApiV2(auth, baseURL || didApiUrl, agentId, callbacks.onError);
    let sessionId: string | undefined;

    let token: string | undefined;
    let url: string | undefined;
    let interruptEnabled = true;

    try {
        const streamResponse = await streamApi.createStream({
            transport: sessionOptions.transport,
            chat_persist: sessionOptions.chat_persist ?? true,
        });

        const { id, session_token, session_url, interrupt_enabled } = streamResponse;
        callbacks.onStreamCreated?.({ session_id: id, stream_id: id, agent_id: agentId });
        sessionId = id;
        token = session_token;
        url = session_url;
        interruptEnabled = interrupt_enabled ?? true;

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
            log(
                `Track subscription timeout - no track subscribed within ${TRACK_SUBSCRIPTION_TIMEOUT_MS / 1000} seconds after connect`
            );
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
                microphoneState.publication = null;
                cameraState.publication = null;
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

    function handleVideoStarted() {
        if (videoStreamingState === StreamingState.Start) {
            return;
        }

        log('CALLBACK: onVideoStateChange(Start)');
        videoStreamingState = StreamingState.Start;
        callbacks.onVideoStateChange?.(StreamingState.Start);
    }

    function handleVideoStopped(report?: VideoRTCStatsReport) {
        if (videoStreamingState === StreamingState.Stop) {
            return;
        }

        log('CALLBACK: onVideoStateChange(Stop)');
        videoStreamingState = StreamingState.Stop;
        callbacks.onVideoStateChange?.(StreamingState.Stop, report);
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

        if (track.kind === 'audio') {
            audioStatsDetector = createAudioStatsDetector(
                () => track.getRTCStatsReport(),
                ({ sttLatency, serviceLatency }) => {
                    const clientLatency = latencyTimestampTracker.get(true);
                    let rttLatency = 0;
                    if (sttLatency) {
                        const rtt = videoStatsMonitor?.getReport()?.webRTCStats?.avgRtt ?? 0;
                        rttLatency = rtt > 0 ? Math.round(rtt * 1000) : 0;
                    }
                    const latency = clientLatency > 0 ? clientLatency + (sttLatency ?? 0) + rttLatency : undefined;
                    const networkLatency =
                        latency !== undefined && serviceLatency !== undefined ? latency - serviceLatency : undefined;
                    callbacks.onFirstAudioDetected?.({ latency, networkLatency });
                }
            );
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
            videoStatsMonitor = createVideoStatsMonitor(
                () => track.getRTCStatsReport(),
                () => isConnected,
                noop,
                (state, report) => {
                    log(`Video state change: ${state}`);
                    if (state === StreamingState.Start) {
                        if (trackSubscriptionTimeoutId) {
                            clearTimeout(trackSubscriptionTimeoutId);
                            trackSubscriptionTimeoutId = null;
                            log('Track subscription timeout cleared');
                        }
                        handleVideoStarted();
                    } else if (state === StreamingState.Stop) {
                        handleVideoStopped(report);
                    }
                }
            );
            videoStatsMonitor.start();
        }
    }

    function handleTrackUnsubscribed(track: RemoteTrack, publication: any, participant: RemoteParticipant): void {
        log(`Track unsubscribed: ${track.kind} from ${participant.identity}`);

        if (track.kind === 'audio') {
            audioStatsDetector?.destroy();
            audioStatsDetector = null;
        }

        if (track.kind === 'video') {
            handleVideoStopped(videoStatsMonitor?.getReport());
            videoStatsMonitor?.stop();
            videoStatsMonitor = null;
        }
    }

    function handleChatEvents(subject: string, data: any): void {
        const eventName = chatEventMap[subject];
        if (!eventName) return;

        callbacks.onMessage?.(eventName, { event: eventName, ...data });
    }

    /**
     * ToolActive state transitions:
     * - tool-call/started -> sets ToolActive
     * - stream-video/done with interruptible: true -> sets Idle
     * - stream-video/done with interruptible: false -> stays ToolActive (more tools coming)
     */
    function handleToolEvents(subject: string, data: any): void {
        if (subject === StreamEvents.ToolCallStarted) {
            currentActivityState = AgentActivityState.ToolActive;
            callbacks.onAgentActivityStateChange?.(AgentActivityState.ToolActive);
            callbacks.onToolEvent?.(StreamEvents.ToolCallStarted, data as ToolCallStartedPayload);
            return;
        }

        if (subject === StreamEvents.ToolCallDone) {
            callbacks.onToolEvent?.(StreamEvents.ToolCallDone, data as ToolCallDonePayload);
            return;
        }

        if (subject === StreamEvents.ToolCallError) {
            callbacks.onToolEvent?.(StreamEvents.ToolCallError, data as ToolCallErrorPayload);
        }
    }

    function handleVideoActivityState(subject: string, data: any): void {
        currentInterruptible = data.metadata?.interruptible !== false;
        callbacks.onInterruptibleChange?.(currentInterruptible);

        if (subject === StreamEvents.StreamVideoCreated) {
            currentActivityState = AgentActivityState.Talking;
            callbacks.onAgentActivityStateChange?.(AgentActivityState.Talking);
            audioStatsDetector?.arm({
                sttLatency: data?.stt?.latency,
                serviceLatency: data?.serviceLatency,
            });
            return;
        }

        if (currentInterruptible) {
            currentActivityState = AgentActivityState.Idle;
            callbacks.onAgentActivityStateChange?.(AgentActivityState.Idle);
        }
    }

    function handleVideoEvents(subject: string, data: any): void {
        const rtt = videoStatsMonitor?.getReport()?.webRTCStats?.avgRtt ?? 0;
        const downstreamNetworkLatency = rtt > 0 ? Math.round((rtt / 2) * 1000) : 0;
        const messageData: VideoMessageData = { ...data, downstreamNetworkLatency };

        if (options.debug && data?.metadata?.sentiment) {
            messageData.sentiment = {
                id: data.metadata.sentiment.id,
                name: data.metadata.sentiment.sentiment,
            };
        }

        callbacks.onMessage?.(subject as StreamEvents, messageData);
        handleVideoActivityState(subject, data);
    }

    function handleTranscriptionEvents(_: string, data: any): void {
        callbacks.onMessage?.(ChatProgress.Transcribe, { event: ChatProgress.Transcribe, ...data });
        queueMicrotask(() => {
            callbacks.onAgentActivityStateChange?.(AgentActivityState.Loading);
        });
    }

    type DataChannelHandler = (subject: string, data: any) => void;
    const dataChannelHandlers: Record<string, DataChannelHandler> = {
        [StreamEvents.ChatAnswer]: handleChatEvents,
        [StreamEvents.ChatPartial]: handleChatEvents,
        [StreamEvents.ToolCallStarted]: handleToolEvents,
        [StreamEvents.ToolCallDone]: handleToolEvents,
        [StreamEvents.ToolCallError]: handleToolEvents,
        [StreamEvents.StreamVideoCreated]: handleVideoEvents,
        [StreamEvents.StreamVideoDone]: handleVideoEvents,
        [StreamEvents.StreamVideoError]: handleVideoEvents,
        [StreamEvents.StreamVideoRejected]: handleVideoEvents,
        [StreamEvents.ChatAudioTranscribed]: handleTranscriptionEvents,
    };

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

            if (!subject) return;

            const handler = dataChannelHandlers[subject];
            handler?.(subject, data);
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

    function findPublishedTrack(
        track: MediaStreamTrack,
        source: Track.Source,
        publications: Map<string, LocalTrackPublication>
    ): LocalTrackPublication | null {
        for (const [_, publication] of publications) {
            if (publication.source === source && publication.track) {
                const publishedMediaTrack = publication.track.mediaStreamTrack;
                if (publishedMediaTrack === track || publishedMediaTrack?.id === track.id) {
                    return publication as LocalTrackPublication;
                }
            }
        }
        return null;
    }

    async function publishTrackStream(
        state: TrackPublishState,
        stream: MediaStream,
        getTracks: (stream: MediaStream) => MediaStreamTrack[],
        source: Track.Source,
        getPublications: () => Map<string, LocalTrackPublication>,
        unpublishFn: () => Promise<void>
    ): Promise<void> {
        if (!isConnected || !room) {
            log(`Room is not connected, cannot publish ${source} stream`);
            throw new Error('Room is not connected');
        }

        if (state.isPublishing) {
            log(`${source} publish already in progress, skipping`);
            return;
        }

        const tracks = getTracks(stream);
        if (tracks.length === 0) {
            throw new Error(`No ${source} track found in the provided MediaStream`);
        }

        const track = tracks[0];

        const existingPublication = findPublishedTrack(track, source, getPublications());
        if (existingPublication) {
            log(`${source} track is already published, skipping`, {
                trackId: track.id,
                publishedTrackId: existingPublication.track?.mediaStreamTrack?.id,
            });
            state.publication = existingPublication;
            return;
        }

        if (state.publication?.track) {
            const publishedMediaTrack = state.publication.track.mediaStreamTrack;
            if (publishedMediaTrack !== track && publishedMediaTrack?.id !== track.id) {
                log(`Unpublishing existing ${source} track before publishing new one`);
                await unpublishFn();
            }
        }

        log(`Publishing ${source} track from provided MediaStream`, { trackId: track.id });

        state.isPublishing = true;
        try {
            state.publication = await room.localParticipant.publishTrack(track, { source });
            log(`${source} track published successfully`, { trackSid: state.publication.trackSid });
        } catch (error) {
            log(`Failed to publish ${source} track:`, error);
            throw error;
        } finally {
            state.isPublishing = false;
        }
    }

    async function unpublishTrackStream(state: TrackPublishState, label: string): Promise<void> {
        if (!state.publication || !state.publication.track) {
            return;
        }

        try {
            if (room) {
                await room.localParticipant.unpublishTrack(state.publication.track, false);
                log(`${label} track unpublished`);
            }
        } catch (error) {
            log(`Error unpublishing ${label} track:`, error);
        } finally {
            state.publication = null;
        }
    }

    async function publishMicrophoneStream(stream: MediaStream): Promise<void> {
        return publishTrackStream(
            microphoneState,
            stream,
            s => s.getAudioTracks(),
            Track.Source.Microphone,
            () => room!.localParticipant.audioTrackPublications,
            unpublishMicrophoneStream
        );
    }

    async function unpublishMicrophoneStream(): Promise<void> {
        return unpublishTrackStream(microphoneState, 'Microphone');
    }

    async function replaceMicrophoneTrack(track: MediaStreamTrack): Promise<void> {
        if (!isConnected || !room) {
            log('Cannot replace microphone track: room is not connected');
            throw new Error('Room is not connected');
        }
        if (track.kind !== 'audio') {
            log('Cannot replace microphone track: not an audio track', { kind: track.kind });
            throw new Error('Microphone track must be an audio track');
        }
        if (microphoneState.isPublishing) {
            log('Cannot replace microphone track: publish in progress');
            throw new Error('Microphone publish in progress');
        }
        const pub = microphoneState.publication;
        if (!pub || !pub.track) {
            log('Cannot replace microphone track: no publication to replace');
            throw new Error('No microphone publication to replace');
        }
        try {
            microphoneState.isPublishing = true;
            await pub.track.replaceTrack(track);
            log('Microphone track replaced', { trackId: track.id, trackSid: pub.trackSid });
        } finally {
            microphoneState.isPublishing = false;
        }
    }

    async function publishCameraStream(stream: MediaStream): Promise<void> {
        return publishTrackStream(
            cameraState,
            stream,
            s => s.getVideoTracks(),
            Track.Source.Camera,
            () => room!.localParticipant.videoTrackPublications,
            unpublishCameraStream
        );
    }

    async function unpublishCameraStream(): Promise<void> {
        return unpublishTrackStream(cameraState, 'Camera');
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

        audioStatsDetector?.destroy();
        audioStatsDetector = null;

        if (room) {
            callbacks.onConnectionStateChange?.(ConnectionState.Disconnecting, reason);
            await Promise.all([unpublishMicrophoneStream(), unpublishCameraStream()]);
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
        replaceMicrophoneTrack,
        publishCameraStream,
        unpublishCameraStream,

        registerRpcMethod(method: string, handler: (data: any) => Promise<string>) {
            room?.registerRpcMethod(method, handler);
        },
        unregisterRpcMethod(method: string) {
            room?.unregisterRpcMethod(method);
        },

        sessionId,
        streamId: sessionId,
        streamType,
        interruptAvailable: interruptEnabled,
        isInterruptible: currentInterruptible,
    };
}

export type LiveKitStreamingManager<T extends CreateStreamOptions> = StreamingManager<T> & {
    reconnect(): Promise<void>;
};
