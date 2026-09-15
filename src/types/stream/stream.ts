import { Analytics } from '@sdk/services/analytics/mixpanel';
import { VideoRTCStatsReport } from '@sdk/services/streaming-manager/stats/report';
import { Auth } from '../auth';
import { ChatProgressCallback } from '../entities/agents/manager';
import { CreateClipStreamRequest, CreateTalkStreamRequest, SendClipStreamPayload, SendTalkStreamPayload } from './api';
import { ICreateStreamRequestResponse, IceCandidate, SendStreamPayloadResponse, Status } from './rtc';

/**
 * Which video codec the stream should negotiate.
 *
 * Passed as {@link StreamOptions.compatibilityMode}. `on` forces VP8 and `off` forces H264; with
 * `auto` the SDK forwards the flag and the codec is selected according to the browser. Talks (V2)
 * and Clips (V3) agents only — Expressive (V4) avatars negotiate the codec themselves and ignore
 * the setting.
 *
 * @category Streaming Options
 */
export type CompatibilityMode = 'on' | 'off' | 'auto';

/**
 * Whether the agent's video is currently playing.
 *
 * The argument of {@link AgentManagerCallbacks.onVideoStateChange | onVideoStateChange}: it tells
 * the application when to show the streamed video and when to fall back to the agent's idle video.
 *
 * @category Callbacks & Events
 */
export enum StreamingState {
    /** The agent has started speaking; render the streamed media. */
    Start = 'START',
    /** The agent has finished speaking; the application can switch back to the idle video. */
    Stop = 'STOP',
}

/**
 * How well the streamed media is reaching the user.
 *
 * The argument of
 * {@link AgentManagerCallbacks.onConnectivityStateChange | onConnectivityStateChange}. It is
 * estimated from the session's own media statistics — jitter-buffer delay and freeze count for
 * Talks (V2) and Clips (V3), the transport's reported connection quality for Expressive (V4) — so
 * it reflects what this stream is actually getting rather than whether the browser is online.
 *
 * @category Callbacks & Events
 */
export enum ConnectivityState {
    /** The stream is arriving smoothly. */
    Strong = 'STRONG',
    /** The stream is degraded: video is stalling or arriving late. */
    Weak = 'WEAK',
    /** There is not enough data to judge the connection yet, or the stream stopped arriving. */
    Unknown = 'UNKNOWN',
}

/**
 * What the agent is doing right now, for driving the application's UI.
 *
 * The argument of
 * {@link AgentManagerCallbacks.onAgentActivityStateChange | onAgentActivityStateChange}. Expressive
 * (V4) agents move through all four states; Talks (V2) and Clips (V3) agents only alternate between
 * {@link AgentActivityState.Talking | TALKING} and {@link AgentActivityState.Idle | IDLE}, and only
 * on fluent streams.
 *
 * @category Callbacks & Events
 */
export enum AgentActivityState {
    /** The agent is doing nothing and is waiting for the user — the conversational turn has ended. */
    Idle = 'IDLE',
    /**
     * The agent is working on an answer that has not started streaming yet.
     *
     * Expressive (V4) only: set when a turn starts and when the user's speech has just been
     * transcribed. Use it for a typing or thinking indicator.
     */
    Loading = 'LOADING',
    /** The agent's video has started; the agent is speaking. */
    Talking = 'TALKING',
    /**
     * The agent is running one or more tool calls.
     *
     * Expressive (V4) only: set when a tool call starts, and returned to after the agent finishes
     * speaking while any call is still outstanding (for example a client tool waiting on the user).
     * The individual calls are reported by
     * {@link AgentManagerCallbacks.onRunningToolCallsChange | onRunningToolCallsChange}.
     */
    ToolActive = 'TOOL_ACTIVE',
}

/**
 * The event names the server sends on the session's data channel and web socket.
 *
 * Most members are consumed inside the SDK and surface as the callbacks on
 * {@link AgentManagerCallbacks} rather than as raw events: the chat events build the transcript for
 * {@link AgentManagerCallbacks.onNewMessage | onNewMessage}, the stream and stream-video events
 * drive {@link AgentManagerCallbacks.onVideoStateChange | onVideoStateChange} and
 * {@link AgentManagerCallbacks.onAgentActivityStateChange | onAgentActivityStateChange}, and the
 * turn events mark the start and end of a conversational turn. The three `tool-call/*` members are
 * the only ones handed to the application directly, as the first argument of
 * {@link AgentManagerCallbacks.onToolEvent | onToolEvent} — see {@link ToolEventCallback}.
 *
 * @category Callbacks & Events
 */
export enum StreamEvents {
    /** The agent's complete answer for this turn; it becomes an `answer` message in the transcript. */
    ChatAnswer = 'chat/answer',
    /** A fragment of the agent's answer as it is generated; it becomes a `partial` message. */
    ChatPartial = 'chat/partial',
    /** The user's speech, transcribed by the server; it becomes a `user` message. */
    ChatAudioTranscribed = 'chat/audio-transcribed',
    /**
     * A video finished playing, or the session ended — which one depends on where it arrives.
     *
     * On the data channel of a Talks (V2) or Clips (V3) stream it closes the video
     * {@link StreamEvents.StreamStarted | 'stream/started'} opened, once per
     * {@link AgentManager.speak | speak()}, and drives
     * {@link AgentManagerCallbacks.onVideoStateChange | onVideoStateChange} with
     * {@link StreamingState.Stop | STOP} and
     * {@link AgentManagerCallbacks.onAgentActivityStateChange | onAgentActivityStateChange} with
     * {@link AgentActivityState.Idle | IDLE}.
     *
     * On the Talks (V2) and Clips (V3) web socket, and on an Expressive (V4) stream, it instead
     * ends the whole session: it carries the reason, which the SDK passes on as the `reason`
     * argument of {@link AgentManagerCallbacks.onConnectionStateChange | onConnectionStateChange}
     * with {@link ConnectionState.Disconnected | 'disconnected'}. See {@link StreamEndReason}.
     */
    StreamDone = 'stream/done',
    /** A video started playing on a Talks (V2) or Clips (V3) stream. */
    StreamStarted = 'stream/started',
    /**
     * The session ended because the stream failed.
     *
     * On the Talks (V2) and Clips (V3) web socket it is also reported through
     * {@link AgentManagerCallbacks.onError | onError}, as a {@link StreamError}.
     */
    StreamFailed = 'stream/error',
    /**
     * The warmup video has finished and the stream is ready for real content.
     *
     * Only sent when {@link StreamOptions.streamWarmup | streamWarmup} was requested.
     */
    StreamReady = 'stream/ready',
    /**
     * The video currently playing should stop.
     *
     * Sent by the SDK rather than received: it is the message
     * {@link AgentManager.interrupt | interrupt()} puts on the data channel of a fluent Talks (V2)
     * or Clips (V3) stream.
     */
    StreamInterrupt = 'stream/interrupt',
    /** A video for one utterance started playing. */
    StreamVideoCreated = 'stream-video/started',
    /** The video for one utterance finished playing. */
    StreamVideoDone = 'stream-video/done',
    /** Generating or streaming the video for one utterance failed; it is reported through {@link AgentManagerCallbacks.onError | onError}. */
    StreamVideoError = 'stream-video/error',
    /** The server refused to generate the video for one utterance; it is reported through {@link AgentManagerCallbacks.onError | onError}. */
    StreamVideoRejected = 'stream-video/rejected',
    /** The agent started a tool call; the payload is a {@link ToolCallStartedPayload}. */
    ToolCallStarted = 'tool-call/started',
    /** A tool call finished successfully; the payload is a {@link ToolCallDonePayload}. */
    ToolCallDone = 'tool-call/done',
    /** A tool call failed; the payload is a {@link ToolCallErrorPayload}. */
    ToolCallError = 'tool-call/error',
    /** A conversational turn started. Expressive (V4) only. */
    TurnStarted = 'turn/started',
    /** A conversational turn ended. Expressive (V4) only. */
    TurnEnded = 'turn/ended',
}

/**
 * The data-channel topics an application may send on with
 * {@link AgentManager.sendDataChannelMessage | sendDataChannelMessage()}.
 *
 * The remaining data-channel topics are driven by their own methods
 * ({@link AgentManager.chat | chat()}, {@link AgentManager.speak | speak()},
 * {@link AgentManager.interrupt | interrupt()},
 * {@link AgentManager.setSttLanguage | setSttLanguage()}), which own the payload shape and
 * bookkeeping those topics expect, so they are not exposed. The values are the wire strings.
 * Expressive (V4) agents only.
 *
 * @example
 * ```ts
 * import { PublicDataChannelTopic } from '@d-id/client-sdk';
 *
 * await agentManager.sendDataChannelMessage(PublicDataChannelTopic.Presentation, {
 *     type: 'navigate',
 *     slide: 3,
 * });
 * ```
 * @category Agent Manager
 */
export enum PublicDataChannelTopic {
    /**
     * Messages that drive a presentation the agent is showing alongside its video, such as moving
     * to another slide. The payload shape is whatever the presentation the agent is running
     * expects. Sent on the wire as `did.presentation`.
     */
    Presentation = 'did.presentation',
}

/**
 * The state of the connection between the browser and the agent's stream.
 *
 * The first argument of
 * {@link AgentManagerCallbacks.onConnectionStateChange | onConnectionStateChange}.
 * {@link ConnectionState.Connected | 'connected'} is the point at which
 * {@link AgentManager.chat | chat()} and {@link AgentManager.speak | speak()} can be called.
 *
 * @category Callbacks & Events
 */
export enum ConnectionState {
    /** The connection object exists but nothing has been negotiated yet. */
    New = 'new',
    /** The connection could not be established, or dropped irrecoverably. */
    Fail = 'fail',
    /** The stream is live: the agent can be spoken to and its video rendered. */
    Connected = 'connected',
    /** The connection is being established, or re-established after a drop. */
    Connecting = 'connecting',
    /** The connection has been shut down and cannot be used again. */
    Closed = 'closed',
    /** Negotiation finished and the connection is fully established. */
    Completed = 'completed',
    /**
     * {@link AgentManager.disconnect | disconnect()} is in progress.
     *
     * Expressive (V4) agents only; Talks (V2) and Clips (V3) go straight from
     * {@link ConnectionState.Connected | 'connected'} to
     * {@link ConnectionState.Disconnected | 'disconnected'}.
     */
    Disconnecting = 'disconnecting',
    /**
     * The stream has ended.
     *
     * The `reason` argument of
     * {@link AgentManagerCallbacks.onConnectionStateChange | onConnectionStateChange} says why —
     * a {@link StreamEndReason} when the server ended the session deliberately. Reconnecting with
     * {@link AgentManager.reconnect | reconnect()} starts a new stream.
     */
    Disconnected = 'disconnected',
}

/**
 * How the agent's idle and talking video are delivered.
 *
 * Returned by {@link AgentManager.getStreamType | getStreamType()}. Which one a session gets
 * follows from the agent and from {@link StreamOptions.fluent | fluent}.
 *
 * @category Streaming Options
 */
export enum StreamType {
    /**
     * Two videos: the agent's idle video, which the application plays itself, and the streamed
     * talking video. Switch between them in
     * {@link AgentManagerCallbacks.onVideoStateChange | onVideoStateChange}.
     */
    Legacy = 'legacy',
    /**
     * One continuous video for both the idle and the talking state, so there is nothing to swap.
     * Expressive (V4) agents always stream this way, and it is what makes
     * {@link AgentManager.interrupt | interrupt()} possible.
     */
    Fluent = 'fluent',
}

/**
 * Handler for an RPC method registered on the LiveKit room before it connects.
 * @internal Implementation type; not part of the public SDK surface.
 */
export type RpcMethodHandler = (data: { payload: string }) => Promise<string>;

/**
 * Identifiers of the stream the SDK has just opened for the session.
 *
 * Handed to `onStreamCreated` once the server has accepted the stream, before the first video frame
 * arrives. Log the three ids together: they are what identifies the session in D-ID's own records.
 *
 * @category Callbacks & Events
 */
export interface StreamCreatedInfo {
    /**
     * Id of the agent the stream was opened for.
     */
    agent_id: string;

    /**
     * Id of the session; the SDK sends it back on every subsequent request for this stream.
     * On Expressive (V4) agents it is the same value as `stream_id`.
     */
    session_id: string;

    /**
     * Id of the stream itself.
     */
    stream_id: string;
}

/**
 * Callback set consumed by the streaming managers (WebRTC and LiveKit).
 * The agent manager adapts these into the public {@link AgentManagerCallbacks}.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface StreamingManagerCallbacks {
    onMessage?: ChatProgressCallback;
    onConnectionStateChange?: (state: ConnectionState, reason?: string) => void;
    onVideoStateChange?: (state: StreamingState, report?: VideoRTCStatsReport) => void;
    onSrcObjectReady?: (value: MediaStream) => void;
    onError?: (error: Error, errorData: Record<string, unknown>) => void;
    onConnectivityStateChange?: (state: ConnectivityState) => void;
    onAgentActivityStateChange?: (state: AgentActivityState) => void;
    onVideoIdChange?: (videoId: string | null) => void;
    onStreamCreated?: (stream: StreamCreatedInfo) => void;
    onStreamReady?: () => void;
    onToolEvent?: ToolEventCallback;
    onInterruptibleChange?: (
        /** `true` while there is something to interrupt, `false` while there is not. */
        interruptible: boolean
    ) => void;
    onRunningToolCallsChange?: (
        /** Every tool call running right now, empty when none is. */
        calls: readonly RunningToolCall[]
    ) => void;
    onFirstAudioDetected?: (metrics: AudioDetectionMetrics) => void;
}

/**
 * Latency measurements captured when the first audio frame of a stream is detected.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface AudioDetectionMetrics {
    latency?: number;
    networkLatency?: number;
}

/**
 * Union of callback names accepted by {@link StreamingManagerCallbacks}.
 * @internal Implementation type; not part of the public SDK surface.
 */
export type ManagerCallbackKeys = keyof StreamingManagerCallbacks;

/**
 * Custom end-user metadata attached to a stream creation request.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface StreamEndUserData {
    plan?: string;
}

/**
 * Options for creating a legacy (talk) stream, combining the wire request with fluent-mode extras.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface TalkStreamOptions extends CreateTalkStreamRequest {
    fluent?: boolean;
    end_user_data?: StreamEndUserData;
}

/**
 * Options for creating a clip stream, combining the wire request with fluent-mode extras.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface ClipStreamOptions extends CreateClipStreamRequest {
    fluent?: boolean;
    end_user_data?: StreamEndUserData;
}

/**
 * Options accepted when creating a stream, discriminated by the underlying stream type (talk or clip).
 * @internal Implementation type; not part of the public SDK surface.
 */
export type CreateStreamOptions = TalkStreamOptions | ClipStreamOptions;

/**
 * Maps a {@link CreateStreamOptions} variant to the payload type sent to drive that stream.
 * @internal Implementation type; not part of the public SDK surface.
 */
export type PayloadType<T> = T extends TalkStreamOptions
    ? SendTalkStreamPayload
    : T extends ClipStreamOptions
      ? SendClipStreamPayload
      : never;

/**
 * HTTP client surface used by the streaming managers to create and drive a WebRTC stream.
 * @internal Implementation type; not part of the public SDK surface.
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
 */
export interface StreamingManagerOptions {
    callbacks: StreamingManagerCallbacks;
    baseURL?: string;
    debug?: boolean;
    verbose?: boolean;
    auth: Auth;
    analytics: Analytics;
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
 */
export interface StreamInterruptPayload {
    type: StreamEvents.StreamInterrupt;
    videoId: string;
    timestamp: number;
}

/**
 * A client tool's implementation: the function that runs in the browser when the agent calls it.
 *
 * Register it with {@link AgentManager.registerClientTool | registerClientTool()}, under the tool
 * name defined in the agent's configuration. The SDK parses the arguments the agent's LLM produced
 * and passes them in; whatever the handler resolves with is sent back to the agent as the tool's
 * result. Throwing rejects the call, and the error message is forwarded to the agent. Expressive
 * (V4) agents only.
 *
 * @param args - The arguments the LLM produced for this call, already parsed from JSON.
 * @returns A JSON string with the tool's result, at most 15 KiB — the LiveKit RPC response limit;
 * a larger result fails the call with an RPC error.
 * @example
 * ```ts
 * agentManager.registerClientTool('get_cart_total', async args => {
 *     const total = await cart.total(args.currency as string);
 *     return JSON.stringify({ total });
 * });
 * ```
 * @category Callbacks & Events
 */
export type ClientToolHandler = (args: Record<string, unknown>) => Promise<string>;

/**
 * Whether the agent waits for a tool call to finish before it carries on.
 *
 * Set on the agent's tool configuration, and reported on {@link RunningToolCall.executionMode} and
 * {@link ToolCallStartedPayload.execution_mode}. Only a `blocking` call suspends the agent, which
 * is why one being outstanding is what makes the agent uninterruptible — see
 * {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange}.
 *
 * @category Callbacks & Events
 */
export type ToolExecutionMode = 'blocking' | 'async';

/**
 * A tool call currently running in the session.
 *
 * The entries of the array given to
 * {@link AgentManagerCallbacks.onRunningToolCallsChange | onRunningToolCallsChange}. A call appears
 * when it starts and disappears when it finishes, fails, or — for a `blocking` call — when its turn
 * ends; an `async` call outlives its turn.
 *
 * @category Callbacks & Events
 */
export interface RunningToolCall {
    /** Id of this call, matching the `call_id` of the {@link ToolEventPayload} that announced it. */
    callId: string;
    /** Name of the tool being called, as configured on the agent. */
    name: string;
    /**
     * 'blocking' - the agent waits for the result before it can continue.
     * 'async' - the agent keeps talking while the call runs.
     */
    executionMode: ToolExecutionMode;
}

/**
 * The payload of a {@link StreamEvents.ToolCallStarted} event: the agent has begun a tool call.
 *
 * Delivered to {@link AgentManagerCallbacks.onToolEvent | onToolEvent} — see
 * {@link ToolEventCallback}.
 *
 * @category Callbacks & Events
 */
export interface ToolCallStartedPayload {
    /** Id of this call. The matching done or error payload carries the same id. */
    call_id: string;
    /** Name of the tool the agent is calling, as configured on the agent. */
    name: string;
    /** The arguments the agent's LLM produced for this call. */
    input: Record<string, unknown>;
    /** The tool's result. The started event is emitted before the tool has run, so it holds nothing useful yet. */
    output: Record<string, unknown>;
    /**
     * Whether the server considers the agent interruptible while this call is outstanding.
     *
     * Informational: the SDK does not forward it.
     * {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange} is derived from
     * the {@link ToolCallStartedPayload.execution_mode | execution_mode} of the calls still
     * running, not from this field.
     */
    interruptible: boolean;
    /**
     * Whether the agent waits for this call. See {@link ToolExecutionMode}; anything other than
     * `async` is treated as `blocking`.
     */
    execution_mode?: ToolExecutionMode;
    /** The conversational turn this call belongs to, or `null` when it belongs to no turn. */
    turn_id?: number | null;
    /** When the call started, as reported by the server. */
    timestamp: string;
}

/**
 * The payload of a {@link StreamEvents.ToolCallDone} event: a tool call finished successfully.
 *
 * Delivered to {@link AgentManagerCallbacks.onToolEvent | onToolEvent} — see
 * {@link ToolEventCallback}.
 *
 * @category Callbacks & Events
 */
export interface ToolCallDonePayload {
    /** Id of the call that finished, matching the {@link ToolCallStartedPayload} that announced it. */
    call_id: string;
    /** Name of the tool that was called. */
    name: string;
    /** The arguments the call was made with. */
    input: Record<string, unknown>;
    /** The result the tool returned. */
    output: Record<string, unknown>;
    /** How long the call took, in milliseconds. */
    duration_ms: number;
    /** Any additional metadata the tool reported alongside its result. */
    extra: Record<string, unknown>;
    /** When the call finished, as reported by the server. */
    timestamp: string;
}

/**
 * The payload of a {@link StreamEvents.ToolCallError} event: a tool call failed.
 *
 * Delivered to {@link AgentManagerCallbacks.onToolEvent | onToolEvent} — see
 * {@link ToolEventCallback}. The agent carries on with the conversation; the SDK does not retry.
 *
 * @category Callbacks & Events
 */
export interface ToolCallErrorPayload {
    /** Id of the call that failed, matching the {@link ToolCallStartedPayload} that announced it. */
    call_id: string;
    /** Name of the tool that was called. */
    name: string;
    /** The arguments the call was made with. */
    input: Record<string, unknown>;
    /** Whatever the failed call produced, if anything. */
    output: Record<string, unknown>;
    /** How long the call ran before failing, in milliseconds. */
    duration_ms: number;
    /** Any additional metadata the server reported with the failure. */
    extra: Record<string, unknown>;
    /** When the call failed, as reported by the server. */
    timestamp: string;
}

/**
 * Any of the three tool-call payloads, discriminated by the event they arrive with.
 *
 * The second argument of {@link AgentManagerCallbacks.onToolEvent | onToolEvent}. The overloads on
 * {@link ToolEventCallback} narrow it for you, so a handler typed with that callback sees the
 * concrete payload rather than this union.
 *
 * @category Callbacks & Events
 */
export type ToolEventPayload = ToolCallStartedPayload | ToolCallDonePayload | ToolCallErrorPayload;

/**
 * Data-channel payload identifying the conversational turn a `turn/started` or `turn/ended` event belongs to.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface TurnEventPayload {
    turn_id: number | null;
}

/**
 * Why the server ended the session.
 *
 * Arrives as the `reason` argument of
 * {@link AgentManagerCallbacks.onConnectionStateChange | onConnectionStateChange} together with
 * {@link ConnectionState.Disconnected | 'disconnected'}, and is how you tell a session the server
 * closed on purpose from a connection that simply dropped — `reason` is an opaque transport
 * diagnostic in the latter case, so compare it against these values rather than parsing it. A
 * close reason the SDK does not recognise is forwarded as-is, which is the other reason to compare
 * against the enum. Which members can arrive depends on the agent type: Talks (V2) and Clips (V3)
 * agents report only {@link StreamEndReason.Ok | Ok},
 * {@link StreamEndReason.UnknownError | UnknownError},
 * {@link StreamEndReason.NetworkIssue | NetworkIssue} and
 * {@link StreamEndReason.Inactivity | Inactivity}.
 * {@link AgentManager.reconnect | reconnect()} still works afterwards; it starts a new stream
 * rather than resuming the ended one.
 *
 * @example Reacting to the limits an Expressive (V4) session reports
 * ```ts
 * import { ConnectionState, StreamEndReason } from '@d-id/client-sdk';
 *
 * const callbacks = {
 *     onConnectionStateChange(state, reason) {
 *         if (state !== ConnectionState.Disconnected) return;
 *
 *         if (reason === StreamEndReason.TimeLimit || reason === StreamEndReason.MessageLimit) {
 *             showMessage('This session has reached its limit.');
 *         } else if (reason === StreamEndReason.Inactivity) {
 *             showMessage('The session timed out.');
 *         }
 *     },
 * };
 * ```
 * @category Callbacks & Events
 */
export enum StreamEndReason {
    /** The session ended normally, because it was closed deliberately. */
    Ok = 'ok',
    /** The session ended because of a failure the server could not classify. */
    UnknownError = 'unknown_error',
    /** The session ended because the connection to the browser broke down. */
    NetworkIssue = 'network_issue',
    /**
     * The session ended because it reached the message limit configured for the agent.
     *
     * Expressive (V4) agents.
     */
    MessageLimit = 'message_limit',
    /**
     * The session ended because it reached its maximum duration.
     *
     * Expressive (V4) agents.
     */
    TimeLimit = 'time_limit',
    /**
     * The session ended because nothing happened for too long.
     *
     * The window is {@link StreamOptions.sessionTimeout | sessionTimeout} for Talks (V2) and
     * Clips (V3).
     */
    Inactivity = 'inactivity',
    /**
     * The agent itself ended the call.
     *
     * Expressive (V4) agents.
     */
    EndedByAgent = 'ended_by_agent',
}

/**
 * The signature of {@link AgentManagerCallbacks.onToolEvent | onToolEvent}.
 *
 * Three overloads, one per tool-call event, so the first argument narrows the second: a handler
 * written against this type sees {@link ToolCallStartedPayload},
 * {@link ToolCallDonePayload} or {@link ToolCallErrorPayload} rather than the
 * {@link ToolEventPayload} union. Expressive (V4) agents only.
 *
 * @example
 * ```ts
 * import { StreamEvents } from '@d-id/client-sdk';
 *
 * const callbacks = {
 *     onToolEvent(event, data) {
 *         if (event === StreamEvents.ToolCallStarted) {
 *             console.log('started', data.name, data.input);
 *         } else if (event === StreamEvents.ToolCallDone) {
 *             console.log('done', data.name, data.output, data.duration_ms);
 *         } else {
 *             console.log('failed', data.name, data.extra);
 *         }
 *     },
 * };
 * ```
 * @category Callbacks & Events
 */
export type ToolEventCallback = {
    /**
     * @param event - {@link StreamEvents.ToolCallStarted}.
     * @param data - The call that just started.
     */
    (event: StreamEvents.ToolCallStarted, data: ToolCallStartedPayload): void;
    /**
     * @param event - {@link StreamEvents.ToolCallDone}.
     * @param data - The call that just finished, with its result.
     */
    (event: StreamEvents.ToolCallDone, data: ToolCallDonePayload): void;
    /**
     * @param event - {@link StreamEvents.ToolCallError}.
     * @param data - The call that just failed.
     */
    (event: StreamEvents.ToolCallError, data: ToolCallErrorPayload): void;
};
