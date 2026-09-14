import { Analytics } from '@sdk/services/analytics/mixpanel';
import { VideoRTCStatsReport } from '@sdk/services/streaming-manager/stats/report';
import { Auth } from '../auth';
import { ChatProgressCallback } from '../entities/agents/manager';
import { CreateClipStreamRequest, CreateTalkStreamRequest, SendClipStreamPayload, SendTalkStreamPayload } from './api';
import { DataChannelTopic } from './data-channel';
import { ICreateStreamRequestResponse, IceCandidate, SendStreamPayloadResponse, Status } from './rtc';

export type CompatibilityMode = 'on' | 'off' | 'auto';

export enum StreamingState {
    Start = 'START',
    Stop = 'STOP',
}

export enum ConnectivityState {
    Strong = 'STRONG',
    Weak = 'WEAK',
    Unknown = 'UNKNOWN',
}

export enum AgentActivityState {
    Idle = 'IDLE',
    Loading = 'LOADING',
    Talking = 'TALKING',
    ToolActive = 'TOOL_ACTIVE',
}

export enum StreamEvents {
    ChatAnswer = 'chat/answer',
    ChatPartial = 'chat/partial',
    ChatAudioTranscribed = 'chat/audio-transcribed',
    StreamDone = 'stream/done',
    StreamStarted = 'stream/started',
    StreamFailed = 'stream/error',
    StreamReady = 'stream/ready',
    StreamCreated = 'stream/created',
    StreamInterrupt = 'stream/interrupt',
    StreamVideoCreated = 'stream-video/started',
    StreamVideoDone = 'stream-video/done',
    StreamVideoError = 'stream-video/error',
    StreamVideoRejected = 'stream-video/rejected',
    ToolCallStarted = 'tool-call/started',
    ToolCallDone = 'tool-call/done',
    ToolCallError = 'tool-call/error',
    TurnStarted = 'turn/started',
    TurnEnded = 'turn/ended',
}

/**
 * Topics a customer can send on via `agentManager.sendDataChannelMessage`.
 * The remaining `DataChannelTopic` members are driven by their own methods
 * (`chat`, `speak`, `interrupt`, `setSttLanguage`), which own the payload shape
 * and bookkeeping those topics expect, so they stay internal.
 *
 * A const object rather than a second enum: it borrows the value from
 * `DataChannelTopic`, so there is one source of truth for the wire string and
 * no cast is needed where the topic reaches the transport.
 */
export const PublicDataChannelTopic = { Presentation: DataChannelTopic.Presentation } as const;
export type PublicDataChannelTopic = (typeof PublicDataChannelTopic)[keyof typeof PublicDataChannelTopic];

export enum ConnectionState {
    New = 'new',
    Fail = 'fail',
    Connected = 'connected',
    Connecting = 'connecting',
    Closed = 'closed',
    Completed = 'completed',
    Disconnecting = 'disconnecting',
    Disconnected = 'disconnected',
}

export enum StreamType {
    Legacy = 'legacy',
    Fluent = 'fluent',
}

/**
 * Handler for an RPC method registered on the LiveKit room before it connects.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export type RpcMethodHandler = (data: { payload: string }) => Promise<string>;

/**
 * Callback set consumed by the streaming managers (WebRTC and LiveKit).
 * The agent manager adapts these into the public {@link AgentManagerCallbacks}.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface StreamingManagerCallbacks {
    onMessage?: ChatProgressCallback;
    onConnectionStateChange?: (state: ConnectionState, reason?: string) => void;
    onVideoStateChange?: (state: StreamingState, report?: VideoRTCStatsReport) => void;
    onSrcObjectReady?: (value: MediaStream) => void;
    onError?: (error: Error, errorData: object) => void;
    onConnectivityStateChange?: (state: ConnectivityState) => void;
    onAgentActivityStateChange?: (state: AgentActivityState) => void;
    onVideoIdChange?: (videoId: string | null) => void;
    onStreamCreated?: (stream: { stream_id: string; session_id: string; agent_id: string }) => void;
    onStreamReady?: () => void;
    onToolEvent?: ToolEventCallback;
    onInterruptibleChange?: (interruptible: boolean) => void;
    onRunningToolCallsChange?: (calls: readonly RunningToolCall[]) => void;
    onFirstAudioDetected?: (metrics: AudioDetectionMetrics) => void;
}

/**
 * Former name of {@link StreamingManagerCallbacks}.
 * @internal
 * @deprecated This was never the callbacks type accepted by `createAgentManager`; use
 * {@link AgentManagerCallbacks}. Removed from the package exports in the next major.
 */
export type ManagerCallbacks = StreamingManagerCallbacks;

/**
 * Latency measurements captured when the first audio frame of a stream is detected.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface AudioDetectionMetrics {
    latency?: number;
    networkLatency?: number;
}

/**
 * Union of callback names accepted by {@link StreamingManagerCallbacks}.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export type ManagerCallbackKeys = keyof StreamingManagerCallbacks;

/**
 * Custom end-user metadata attached to a stream creation request.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface StreamEndUserData {
    plan?: string;
}

/**
 * Options for creating a legacy (talk) stream, combining the wire request with fluent-mode extras.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface TalkStreamOptions extends CreateTalkStreamRequest {
    fluent?: boolean;
    end_user_data?: StreamEndUserData;
}

/**
 * Options for creating a clip stream, combining the wire request with fluent-mode extras.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface ClipStreamOptions extends CreateClipStreamRequest {
    fluent?: boolean;
    end_user_data?: StreamEndUserData;
}

/**
 * Options accepted when creating a stream, discriminated by the underlying stream type (talk or clip).
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export type CreateStreamOptions = TalkStreamOptions | ClipStreamOptions;

/**
 * Maps a {@link CreateStreamOptions} variant to the payload type sent to drive that stream.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export type PayloadType<T> = T extends TalkStreamOptions
    ? SendTalkStreamPayload
    : T extends ClipStreamOptions
      ? SendClipStreamPayload
      : never;

/**
 * HTTP client surface used by the streaming managers to create and drive a WebRTC stream.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface RtcApi {
    createStream(options: CreateStreamOptions, signal?: AbortSignal): Promise<ICreateStreamRequestResponse>;
    startConnection(
        streamId: string,
        answer: RTCSessionDescriptionInit,
        sessionId?: string,
        signal?: AbortSignal
    ): Promise<Status>;
    addIceCandidate(
        streamId: string,
        candidate: IceCandidate,
        sessionId: string,
        signal?: AbortSignal
    ): Promise<Status>;
    sendStreamRequest(
        streamId: string,
        sessionId: string,
        payload: SendClipStreamPayload | SendTalkStreamPayload
    ): Promise<SendStreamPayloadResponse>;
    close(streamId: string, sessionId: string): Promise<Status>;
}

/**
 * Options used to construct a streaming manager (WebRTC or LiveKit) instance.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface StreamingManagerOptions {
    callbacks: StreamingManagerCallbacks;
    baseURL?: string;
    debug?: boolean;
    verbose?: boolean;
    auth: Auth;
    analytics: Analytics;
    /**
     * Optional MediaStream to use for microphone input.
     * If provided, the audio track from this stream will be published to the data channel.
     * Supported by LiveKit streaming managers.
     */
    microphoneStream?: MediaStream;
    /**
     * RPC methods to register on the room before it connects, so the agent can
     * call them from the moment this participant joins.
     * @internal
     */
    rpcMethods?: ReadonlyMap<string, RpcMethodHandler>;
}

/**
 * Trimmed set of WebRTC inbound video stats sampled from `RTCStatsReport`, sampled for internal quality analytics.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface SlimRTCStatsReport {
    index: number;
    codec: string;
    rtt: number;
    duration?: number;
    bitrate?: number;
    timestamp: any;
    bytesReceived: any;
    packetsReceived: any;
    packetsLost: any;
    framesDropped: any;
    framesDecoded: any;
    jitter: any;
    jitterBufferDelay: number;
    jitterBufferEmittedCount: number;
    avgJitterDelayInInterval: number;
    frameWidth: any;
    frameHeight: any;
    framesPerSecond: any;
    freezeCount: number;
    freezeDuration: number;
    av?: AvSyncSample;
}

/**
 * A single audio/video playout timestamp pair sampled during an utterance, used to compute lip-sync drift.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface AvSyncSample {
    /** Audio estimatedPlayoutTimestamp (ms, NTP) — playout time of the audio sample currently being rendered. */
    audioPlayout: number;
    /** Video estimatedPlayoutTimestamp (ms, NTP) — playout time of the video frame currently being rendered. */
    videoPlayout: number;
    /** Local timestamp of this sample (ms) — the video inbound-rtp report timestamp; the utterance time axis. */
    localTs: number;
}

/**
 * Lip-sync (audio/video) drift analysis computed over an utterance's `AvSyncSample`s.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface AvSyncReport {
    /** Measurable samples in this utterance (both audio and video playout present). Report is null if fewer than 2. */
    sampleCount: number;
    /** Measurement window in milliseconds (first to last sample). */
    durationMs: number;
    /** How long the A/V offset was perceptibly off (audio ahead > 45ms or behind > 100ms) — the "was there a lip-sync issue, and for how long" signal. */
    desyncDurationMs: number;
    /** The single worst offset (largest magnitude), signed. Positive = audio ahead of video, negative = video ahead. */
    maxOffsetMs: number;
    /** Settled offset after startup (signed median over the back half). ~0 = recovered; non-zero = persistent lip-sync error. */
    residualOffsetMs: number;
}

/**
 * WebRTC video stats reported to analytics (Mixpanel) at stream end.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface AnalyticsRTCStatsReport {
    timestamp?: number;
    duration: number;
    bytesReceived: number;
    bitrate: number;
    packetsReceived: number;
    packetsLost: number;
    framesDropped: number;
    framesDecoded: number;
    jitter: number;
    jitterBufferDelay: number;
    jitterBufferEmittedCount: number;
    avgJitterDelayInInterval: number;
    framesPerSecond: number;
    freezeCount: number;
    freezeDuration: number;
    lowFpsCount?: number;
    causes?: string[];
}

/**
 * Data-channel payload notifying that the current stream utterance was interrupted.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface StreamInterruptPayload {
    type: StreamEvents.StreamInterrupt;
    videoId: string;
    timestamp: number;
}

export type ClientToolHandler = (args: Record<string, unknown>) => Promise<string>;

export type ToolExecutionMode = 'blocking' | 'async';

/** A tool call currently running in the session. */
export interface RunningToolCall {
    callId: string;
    name: string;
    /**
     * 'blocking' - the agent waits for the result before it can continue.
     * 'async' - the agent keeps talking while the call runs.
     */
    executionMode: ToolExecutionMode;
}

export interface ToolCallStartedPayload {
    call_id: string;
    name: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    interruptible: boolean;
    execution_mode?: ToolExecutionMode;
    turn_id?: number | null;
    timestamp: string;
}

export interface ToolCallDonePayload {
    call_id: string;
    name: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    duration_ms: number;
    extra: Record<string, unknown>;
    timestamp: string;
}

export interface ToolCallErrorPayload {
    call_id: string;
    name: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    duration_ms: number;
    extra: Record<string, unknown>;
    timestamp: string;
}

export type ToolEventPayload = ToolCallStartedPayload | ToolCallDonePayload | ToolCallErrorPayload;

/**
 * Data-channel payload identifying the conversational turn a `turn/started` or `turn/ended` event belongs to.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface TurnEventPayload {
    turn_id: number | null;
}

export enum StreamEndReason {
    Ok = 'ok',
    UnknownError = 'unknown_error',
    NetworkIssue = 'network_issue',
    MessageLimit = 'message_limit',
    TimeLimit = 'time_limit',
    Inactivity = 'inactivity',
    EndedByAgent = 'ended_by_agent',
}

export type ToolEventCallback = {
    (event: StreamEvents.ToolCallStarted, data: ToolCallStartedPayload): void;
    (event: StreamEvents.ToolCallDone, data: ToolCallDonePayload): void;
    (event: StreamEvents.ToolCallError, data: ToolCallErrorPayload): void;
};
