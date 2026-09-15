import { STTTokenResponse } from '@sdk/types';
import { Auth } from '@sdk/types/auth';
import {
    AgentActivityState,
    ClientToolHandler,
    CompatibilityMode,
    ConnectionState,
    ConnectivityState,
    PublicDataChannelTopic,
    SendStreamPayloadResponse,
    StreamCreatedInfo,
    StreamEvents,
    StreamType,
    StreamingState,
} from '@sdk/types/stream';
import { SupportedStreamScript } from '@sdk/types/stream-script';
import type { StreamingManagerCallbacks as StreamManagerCallbacks } from '../../stream/stream';
import { Agent } from './agent';
import { ChatMode, ChatResponse, Interrupt, Message, RatingEntity, SubmitFeedbackResponse } from './chat';

/**
 * Types of events provided in Chat Progress Callback
 * @internal Implementation type; not part of the public SDK surface.
 */
export enum ChatProgress {
    /**
     * Chat was successfully embedded
     */
    Embed = 'embed',
    /**
     * Server processing chat message
     */
    Query = 'query',
    /**
     * Server returns a part of the message
     */
    Partial = 'partial',
    /**
     * Server processed message and returned response
     */
    Answer = 'answer',
    /**
     * Audio-transcribed user message
     */
    Transcribe = 'transcribe',
    /**
     * Chat was closed
     */
    Complete = 'done',
}

/**
 * Callback signature for {@link ChatProgress} events emitted internally during a chat exchange.
 * @internal Implementation type; not part of the public SDK surface.
 */
export type ChatProgressCallback = (progress: ChatProgress | StreamEvents, data: any) => void;

/**
 * Handlers the SDK calls as the connection, the video stream and the chat change state.
 *
 * Pass the object as {@link AgentManagerOptions.callbacks}. Only
 * {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} is required — without it there
 * is nothing to render the agent into. Every handler is called from the SDK's own event handling,
 * so keep the work inside short.
 *
 * The handlers fall into four groups: the connection
 * ({@link AgentManagerCallbacks.onConnectionStateChange | onConnectionStateChange},
 * {@link AgentManagerCallbacks.onConnectivityStateChange | onConnectivityStateChange},
 * {@link AgentManagerCallbacks.onError | onError}), the video stream
 * ({@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady},
 * {@link AgentManagerCallbacks.onStreamCreated | onStreamCreated},
 * {@link AgentManagerCallbacks.onVideoStateChange | onVideoStateChange},
 * {@link AgentManagerCallbacks.onAgentActivityStateChange | onAgentActivityStateChange},
 * {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange}), the chat
 * ({@link AgentManagerCallbacks.onNewChat | onNewChat}, {@link AgentManagerCallbacks.onNewMessage | onNewMessage},
 * {@link AgentManagerCallbacks.onModeChange | onModeChange}) and client tools
 * ({@link AgentManagerCallbacks.onToolEvent | onToolEvent},
 * {@link AgentManagerCallbacks.onRunningToolCallsChange | onRunningToolCallsChange}). A handler that
 * lives outside the object can be typed with an indexed access such as
 * `AgentManagerCallbacks['onNewMessage']`.
 *
 * @category Callbacks & Events
 */
export interface AgentManagerCallbacks {
    /**
     * Called every time the connection to the agent's stream changes state.
     *
     * Triggered by {@link AgentManager.connect | connect()},
     * {@link AgentManager.reconnect | reconnect()} and
     * {@link AgentManager.disconnect | disconnect()}.
     * {@link ConnectionState.Connected | 'connected'} is the point at which
     * {@link AgentManager.chat | chat()} and {@link AgentManager.speak | speak()} can be called.
     *
     * @param state - The state just reached: one of `new`, `connecting`, `connected`, `completed`,
     * `disconnecting`, `disconnected`, `closed` or `fail`. See {@link ConnectionState}.
     * @param reason - Why that state was reached. On `disconnected` it is a
     * {@link StreamEndReason} value when the server ended the stream on purpose, which is how you
     * tell a deliberate end from a dropped connection. Talks (V2) and Clips (V3) agents report
     * only `ok`, `unknown_error`, `network_issue` and `inactivity`; `message_limit`, `time_limit`
     * and `ended_by_agent` come from Expressive (V4) agents. A close reason the SDK does not
     * recognise is forwarded as-is, so compare `reason` against the enum rather than parsing it;
     * any other value is an opaque transport diagnostic.
     * {@link AgentManager.reconnect | reconnect()} still works after a deliberate end; it starts a
     * new stream rather than resuming the old one.
     * @example
     * ```ts
     * onConnectionStateChange(state, reason) {
     *     console.log('onConnectionStateChange(): ', state, reason);
     *
     *     if (state === 'connected') {
     *         console.log("I'm ready to go!");
     *     }
     * }
     * ```
     */
    onConnectionStateChange?(state: ConnectionState, reason?: string): void;
    /**
     * Called when the streamed video starts and stops, so the video element can switch source.
     *
     * Triggered by {@link AgentManager.chat | chat()} and {@link AgentManager.speak | speak()}. On
     * `STOP` point the element at the agent's idle video ({@link Agent.idle_video}); on `START` put
     * the stream handed to {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} back
     * on it.
     *
     * @param state - {@link StreamingState.Start | START} while the agent is speaking,
     * {@link StreamingState.Stop | STOP} once it has finished.
     * @example
     * ```ts
     * onVideoStateChange(state) {
     *     console.log('onVideoStateChange(): ', state);
     *
     *     if (state === 'STOP') {
     *         videoElement.srcObject = undefined;
     *         videoElement.src = agentManager.agent.idle_video ?? '';
     *     } else {
     *         videoElement.src = '';
     *         videoElement.srcObject = srcObject;
     *     }
     * }
     * ```
     */
    onVideoStateChange?(state: StreamingState): void;
    /**
     * Called with the media stream carrying the agent's video and audio. Required.
     *
     * This is the one callback the SDK cannot work without: assign the value to the `srcObject` of
     * your `<video>` element, and keep a reference to it, because
     * {@link AgentManagerCallbacks.onVideoStateChange | onVideoStateChange} has to put it back
     * after the idle video has been shown. Triggered by
     * {@link AgentManager.connect | connect()}, {@link AgentManager.reconnect | reconnect()} and
     * {@link AgentManager.disconnect | disconnect()}.
     *
     * @param srcObject - The live media stream to render.
     * @example
     * ```ts
     * let srcObject;
     *
     * const callbacks = {
     *     onSrcObjectReady(value) {
     *         videoElement.srcObject = value;
     *         srcObject = value;
     *     },
     * };
     * ```
     */
    onSrcObjectReady(srcObject: MediaStream): void;
    /**
     * Called with the whole chat transcript every time a message is added or updated.
     *
     * Triggered by {@link AgentManager.chat | chat()}, by {@link AgentManager.speak | speak()} for
     * text scripts, and as the agent's answer streams in. It also fires once while the manager is
     * created, with whatever {@link AgentManagerOptions.initialMessages | initialMessages} were
     * given, and again on every {@link AgentManager.connect | connect()} after the first — both
     * with type `answer`. The array is a fresh copy on each call, oldest message first; every
     * {@link Message} carries an `id`, a `role` of `user` or `assistant` (the agent), its `content`
     * and a `created_at` timestamp.
     *
     * @param messages - The chat so far.
     * @param type - `partial` while the agent's answer is still streaming in, `answer` for the full
     * answer spoken in the streamed video, `user` when the message just added is the user's own
     * (a message passed to {@link AgentManager.chat | chat()}, or a transcribed utterance).
     * @example
     * ```ts
     * onNewMessage(messages, type) {
     *     console.log(messages, type);
     *
     *     if (type === 'answer') {
     *         console.log(messages[messages.length - 1].content);
     *     }
     * }
     * ```
     */
    onNewMessage?(messages: Message[], type: 'answer' | 'partial' | 'user'): void;
    /**
     * Called when a chat is created for this session.
     *
     * A chat is created while {@link AgentManager.connect | connect()} runs, and lazily on the
     * first {@link AgentManager.chat | chat()} when none exists yet. Store the id if you want to
     * correlate the conversation with your own records.
     *
     * @param chatId - Id of the chat that was just created.
     */
    onNewChat?(chatId: string): void;
    /**
     * Called when the chat mode changes.
     *
     * Fires after {@link AgentManager.changeMode | changeMode()}, and when the server answers with
     * a different mode than the one requested (for example {@link ChatMode.Maintenance}).
     *
     * @param mode - The {@link ChatMode} now in effect.
     */
    onModeChange?(mode: ChatMode): void;
    /**
     * Called when the quality of the user's internet connection changes.
     *
     * The state is derived from jitter-buffer delay and freeze count on the video stream for
     * Talks (V2) and Clips (V3) agents, and from LiveKit's reported connection quality for
     * Expressive (V4) agents, so it reflects what the session is actually getting rather than the
     * browser's online flag.
     *
     * @param state - {@link ConnectivityState.Strong | STRONG},
     * {@link ConnectivityState.Weak | WEAK} or {@link ConnectivityState.Unknown | UNKNOWN}.
     * @example
     * ```ts
     * onConnectivityStateChange(state) {
     *     console.log('onConnectivityStateChange(): ', state);
     * }
     * ```
     */
    onConnectivityStateChange?(state: ConnectivityState): void;
    /**
     * Called when the SDK fails, so the application can surface the problem.
     *
     * Receives failures from the Agents API requests, the stream and the web socket — an
     * {@link HttpError} when a request comes back non-2xx, a {@link NetworkError} when it never
     * reaches the server, a {@link WsError} when the web socket itself fails, and also
     * {@link ChatModeDowngraded} and {@link StreamError}. Two errors do not arrive here:
     * {@link ValidationError} and {@link ChatCreationFailed} are thrown to whoever called the
     * method ({@link AgentManager.chat | chat()}, {@link AgentManager.speak | speak()} and the
     * rating methods), so they surface as a rejected promise rather than through this callback.
     *
     * @param error - The error that occurred.
     * @param errorData - Extra context about the failure, such as the request URL and options.
     * @example
     * ```ts
     * onError(error, errorData) {
     *     console.log('Error:', error, 'Error Data', errorData);
     * }
     * ```
     */
    onError?: (error: Error, errorData?: Record<string, unknown>) => void;
    /**
     * Called when the agent moves between idle, loading, talking and running a tool.
     *
     * Use it to drive a typing indicator or to disable input while the agent is busy. The full set
     * of states is reported for Expressive (V4) agents only. Talks (V2) and Clips (V3) agents
     * report just {@link AgentActivityState.Talking | Talking} and
     * {@link AgentActivityState.Idle | Idle}, and only on Fluent streams, plus a final
     * {@link AgentActivityState.Idle | Idle} when the connection closes.
     *
     * @param state - The {@link AgentActivityState} the agent has moved to.
     */
    onAgentActivityStateChange?(state: AgentActivityState): void;
    /**
     * Called once per session when the stream has been created on the server.
     *
     * Fires before the connection reaches {@link ConnectionState.Connected | 'connected'}. The ids
     * are useful when correlating a session with D-ID support or with your own logs.
     *
     * @param stream - The new stream's `stream_id`, `session_id` and `agent_id`.
     */
    onStreamCreated?: (stream: StreamCreatedInfo) => void;
    /**
     * Called when the agent starts, finishes or fails a tool call.
     *
     * Expressive (V4) agents only. The event is one of {@link StreamEvents.ToolCallStarted},
     * {@link StreamEvents.ToolCallDone} or {@link StreamEvents.ToolCallError}, and the payload
     * shape is discriminated by it — see {@link ToolEventCallback}.
     */
    onToolEvent?: StreamManagerCallbacks['onToolEvent'];
    /**
     * Called when the agent becomes interruptible, or stops being interruptible.
     *
     * Expressive (V4) agents only. Use it to enable or disable an interrupt button; on those
     * agents {@link AgentManager.interrupt | interrupt()} does nothing while the agent cannot be
     * interrupted. Talks (V2) and Clips (V3) agents never report a change, and there
     * {@link AgentManager.interrupt | interrupt()} throws rather than doing nothing when no video
     * is playing — check {@link AgentManager.getIsInterruptAvailable | getIsInterruptAvailable()}
     * instead.
     */
    onInterruptibleChange?: StreamManagerCallbacks['onInterruptibleChange'];
    /**
     * Called whenever the set of tool calls running in the session changes.
     *
     * Expressive (V4) agents only. Fires with an empty array on disconnect, so a spinner driven by
     * this callback always clears. Each entry is a {@link RunningToolCall}.
     */
    onRunningToolCallsChange?: StreamManagerCallbacks['onRunningToolCallsChange'];
}

/**
 * Transport settings applied when the stream is created.
 *
 * Talks (V2) and Clips (V3) agents only. Expressive (V4) avatars manage transport settings
 * automatically and ignore these options. Pass the object as
 * {@link AgentManagerOptions.streamOptions}; every field is optional.
 *
 * @category Streaming Options
 */
export interface StreamOptions {
    /**
     * Defines the video codec to be used in the stream.
     *
     * When set to `on`: VP8 will be used.
     * When set to `off`: H264 will be used.
     * When set to `auto`: the codec is selected according to the browser.
     *
     * @default auto
     */
    compatibilityMode?: CompatibilityMode;

    /**
     * Whether to stream a warmup video on the connection.
     *
     * If set to `true`, a warmup video is streamed once the connection is established, which hides
     * the delay before the first real answer. At the end of the warmup video a message containing
     * `stream/ready` is sent on the data channel. Fluent streams ignore it — the warmup only runs
     * on legacy streams (see {@link StreamOptions.fluent | fluent}).
     *
     * @default false
     */
    streamWarmup?: boolean;

    /**
     * Maximum duration (in seconds) between messages before the session times out.
     *
     * Can only be used with proper permissions.
     *
     * @maximum 300
     * @example 180
     */
    sessionTimeout?: number;

    /**
     * Desired stream resolution for the session, as the maximum height or width in pixels.
     *
     * Supported only with Talks presenters (photo-based). When the resolution is not configured it
     * defaults to the agent's own output resolution.
     *
     * @minimum 150
     * @maximum 1080
     */

    /**
     * Whether to request a fluent stream.
     *
     * `true` streams one video for both the idle and talking states; `false` uses the legacy mode,
     * where the application swaps between two video elements. Supported with agents created with
     * V3 Pro Avatars, and always enabled for Expressive (V4) avatars. Fluent streams are also what
     * makes {@link AgentManager.interrupt | interrupt()} available.
     *
     * @default false
     */
    fluent?: boolean;
}

/**
 * Everything {@link createAgentManager} needs to reach an agent and report back to the application.
 *
 * {@link AgentManagerOptions.auth | auth} and {@link AgentManagerOptions.callbacks | callbacks} are
 * required; the rest have defaults that suit a browser application talking to D-ID production.
 *
 * @category Agent Manager
 */
export interface AgentManagerOptions {
    /**
     * Credentials used for every request the SDK makes on the application's behalf.
     *
     * Three shapes are accepted:
     *
     * - `{ type: 'key', clientKey }` — the browser-safe one. `clientKey` is the `data-client-key`
     *   from the agent's Embed snippet (or a key created with the Agents API), and works only from the
     *   domains allowed for that agent. See {@link ClientKeyAuth}.
     * - `{ type: 'bearer', token }` — a bearer token.
     * - `{ type: 'basic', token }` or `{ type: 'basic', username, password }` — basic credentials.
     *
     * Bearer and basic credentials are account-wide: use them from a trusted environment, not from
     * a page you ship to users. See {@link Auth}.
     */
    auth: Auth;
    /**
     * Handlers the SDK calls as the connection, the video stream and the chat change state.
     *
     * See {@link AgentManagerCallbacks}.
     * {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} is mandatory — it is what
     * connects the streamed media to your video element; the rest are optional.
     */
    callbacks: AgentManagerCallbacks;
    /**
     * How the agent answers: with a streamed video, as text only, or not at all.
     *
     * See {@link ChatMode}. It can be changed later with
     * {@link AgentManager.changeMode | changeMode()}.
     *
     * @default ChatMode.Functional
     */
    mode?: ChatMode;
    /**
     * Base URL of the D-ID Agents API. Used by D-ID to point the SDK at a test environment.
     *
     * @internal
     */
    baseURL?: string;
    /**
     * URL of the D-ID notifications web socket. Used by D-ID to point the SDK at a test environment.
     *
     * @internal
     */
    wsURL?: string;
    /**
     * Whether the SDK logs its streaming lifecycle to the browser console.
     *
     * It is also switched on for everyone when the agent's `ui_debug_mode` advanced setting is
     * enabled, regardless of the value passed here.
     *
     * @default false
     */
    debug?: boolean;
    /**
     * Whether the stream is created in verbose mode, which logs more server-side detail.
     *
     * Independent of {@link AgentManagerOptions.debug | debug}: this one is sent to the streaming
     * service rather than controlling console output. Expressive (V4) agents only.
     *
     * @default false
     */
    verbose?: boolean;
    /**
     * Whether to enable analytics (Mixpanel) tracking.
     * @default true
     */
    enableAnalytics?: boolean;
    /**
     * Mixpanel project token the SDK's analytics events are sent to.
     *
     * Defaults to D-ID's own project. Set it to send the SDK's events to your Mixpanel project
     * instead.
     */
    mixpanelKey?: string;
    /**
     * Extra properties merged into every analytics event the SDK sends.
     *
     * A flat object — use it to tag events with your own identifiers. More properties can be added
     * later with {@link AgentManager.enrichAnalytics | enrichAnalytics()}.
     */
    mixpanelAdditionalProperties?: Record<string, unknown>;
    /**
     * Your own identifier for the end user.
     *
     * It is stored in `localStorage`, sent as part of the `type: 'key'` authorization header and
     * attached to analytics, so the same visitor is recognised across page loads. When it is
     * omitted the SDK generates an id and reuses it.
     */
    externalId?: string;
    /**
     * Transport settings applied when the stream is created.
     *
     * See {@link StreamOptions}. Talks (V2) and Clips (V3) agents only. Expressive (V4) avatars
     * manage transport settings automatically.
     */
    streamOptions?: StreamOptions;
    /**
     * Messages the chat starts with, for example a transcript restored from your own storage.
     *
     * They are delivered to {@link AgentManagerCallbacks.onNewMessage | onNewMessage} so the UI can
     * render them. On Talks (V2) and Clips (V3) agents they are also sent as context with the next
     * {@link AgentManager.chat | chat()} request. See {@link Message}.
     */
    initialMessages?: Message[];
    /**
     * Whether the server keeps the chat so it can be resumed in a later session.
     *
     * Without persistence a chat lives only as long as the connection.
     * {@link AgentManager.reconnect | reconnect()} normally continues the same chat either way —
     * see the caveat there for Expressive (V4) agents.
     *
     * The default differs by agent type. Talks (V2) and Clips (V3) agents do not persist the chat
     * unless this is set to `true`. Expressive (V4) agents do persist it unless this is set to
     * `false`: the SDK forwards the key only when you set it, and the service treats an absent key
     * as persistence on.
     */
    persistentChat?: boolean;
}

/**
 * A live connection to one agent: its profile, its chat, and the video stream it answers on.
 *
 * Created by {@link createAgentManager}. Nothing happens on the wire until
 * {@link AgentManager.connect | connect()} resolves; after that
 * {@link AgentManager.chat | chat()} makes the agent answer with its own LLM and
 * {@link AgentManager.speak | speak()} makes it say exactly what you give it. Call
 * {@link AgentManager.disconnect | disconnect()} when the user leaves.
 *
 * Some members work only with some avatar types: each one says so.
 *
 * @category Agent Manager
 */
export interface AgentManager {
    /**
     * The agent this manager is connected to, as the Agents API returned it.
     *
     * Fetched once while the manager is created, so it is available before
     * {@link AgentManager.connect | connect()}. Useful for rendering the agent's name, thumbnail
     * and {@link Agent.idle_video | idle_video}. To know more about agents go to
     * https://docs.d-id.com/reference/agent-get
     */
    agent: Agent;
    /**
     * Returns the kind of stream the current session negotiated.
     *
     * @returns {@link StreamType.Fluent} for a fluent stream (one video for the idle and talking
     * states), {@link StreamType.Legacy} for the two-element legacy mode, or `undefined` before
     * {@link AgentManager.connect | connect()} has established a session.
     */
    getStreamType(): StreamType | undefined;

    /**
     * Returns whether the current stream supports interrupting the agent mid-answer.
     *
     * True for fluent streams (V3 Pro Avatars) and Expressive (V4) agents once connected. This says
     * the stream supports interrupting at all;
     * {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange} says whether
     * there is something to interrupt right now.
     *
     * @returns `true` when {@link AgentManager.interrupt | interrupt()} can do anything.
     */
    getIsInterruptAvailable(): boolean;

    /**
     * The agent's starter messages.
     *
     * Suggested openers to offer the user as buttons; empty when the agent defines none. Available
     * before {@link AgentManager.connect | connect()}.
     */
    starterMessages: string[];
    /**
     * Fetches a short-lived token for the D-ID speech-to-text service.
     *
     * The SDK sends the request whenever it is called, connected or not; the service decides
     * whether to issue a token for the agent.
     *
     * @returns The {@link STTTokenResponse} for this agent.
     * @throws {@link HttpError} When the service does not answer with a token, or the request comes
     * back non-2xx for any other reason.
     */
    getSTTToken(): Promise<STTTokenResponse>;
    /**
     * Opens a new session with the agent: a new WebRTC connection, a new web socket and a new chat.
     *
     * Resolves once the connection reaches {@link ConnectionState.Connected | 'connected'}, by
     * which point {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} has been called
     * with the media stream to render. Calling it again starts a fresh conversation; to keep the
     * current one use {@link AgentManager.reconnect | reconnect()}.
     *
     * @returns Resolves when the agent is connected and ready.
     * @example
     * ```ts
     * await agentManager.connect();
     * ```
     */
    connect(): Promise<void>;
    /**
     * Reopens the stream when the session expires, and continues the conversation on the same chat.
     *
     * The chat id normally does not change, so the agent keeps its context. It starts a new stream
     * — including after the server ended the previous one deliberately — rather than resuming the
     * old one. On Expressive (V4) agents the transport is asked to reconnect first; if that fails
     * the SDK falls back to a disconnect and a fresh connect, which starts a new chat id.
     *
     * @returns Resolves when the new stream is connected.
     */
    reconnect(): Promise<void>;
    /**
     * Closes the existing connection and chat with the agent: the stream and the web socket.
     *
     * Call it when the user leaves the page or the conversation, so the session does not keep
     * running. After it resolves, {@link AgentManager.connect | connect()} is needed before the
     * agent can be used again.
     *
     * @returns Resolves once everything is closed.
     */
    disconnect(): Promise<void>;
    /**
     * Publishes a microphone audio track to the session so the agent can hear the user.
     *
     * Call it after {@link AgentManager.connect | connect()} to enable voice input. Expressive (V4)
     * agents only; on Talks (V2) and Clips (V3) agents the returned promise rejects.
     *
     * @param stream - A `MediaStream` whose audio track is published to the session.
     * @returns Resolves once the track is published.
     * @example
     * ```ts
     * const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
     * await agentManager.publishMicrophoneStream(micStream);
     * ```
     */
    publishMicrophoneStream(stream: MediaStream): Promise<void>;
    /**
     * Stops and removes the currently published microphone track from the session.
     *
     * The counterpart of {@link AgentManager.publishMicrophoneStream | publishMicrophoneStream()} —
     * use it to mute the user for the rest of the session. Expressive (V4) agents only; on Talks
     * (V2) and Clips (V3) agents, and when nothing is published, it resolves without doing
     * anything.
     *
     * @returns Resolves once the track is removed.
     * @example
     * ```ts
     * await agentManager.unpublishMicrophoneStream();
     * ```
     */
    unpublishMicrophoneStream(): Promise<void>;
    /**
     * Swaps the live microphone track without unpublishing it.
     *
     * Use it when the user picks a different input device: the publication is preserved — its
     * LiveKit publication id (SID) and SSRC stay the same, though the `MediaStreamTrack` id
     * changes — so the server sees continuous audio across the swap rather than a stop and a
     * restart. Rejects when there is no active publication — fall back to
     * {@link AgentManager.publishMicrophoneStream | publishMicrophoneStream()} in that case.
     * Expressive (V4) agents only; on Talks (V2) and Clips (V3) agents the returned promise
     * rejects.
     *
     * @param track - The audio track to send from now on.
     * @returns Resolves once the transport has switched to the new track.
     */
    replaceMicrophoneTrack(track: MediaStreamTrack): Promise<void>;
    /**
     * Publishes a camera video track to the session so the agent can see the user.
     *
     * Call it after {@link AgentManager.connect | connect()} to enable vision. Expressive (V4)
     * agents only; on Talks (V2) and Clips (V3) agents the returned promise rejects.
     *
     * @param stream - A `MediaStream` whose video track is published to the session.
     * @returns Resolves once the track is published.
     */
    publishCameraStream(stream: MediaStream): Promise<void>;
    /**
     * Stops and removes the currently published camera track from the session.
     *
     * Call it to disable vision. Expressive (V4) agents only; on Talks (V2) and Clips (V3) agents,
     * and when nothing is published, it resolves without doing anything.
     *
     * @returns Resolves once the track is removed.
     */
    unpublishCameraStream(): Promise<void>;
    /**
     * Sends a message to the agent and gets a streamed video based on its answer (LLM).
     *
     * The answer arrives through {@link AgentManagerCallbacks.onNewMessage | onNewMessage} — first
     * as `partial` chunks, then as the full `answer` — while the video plays it. The chat is
     * created on the first call if the session does not have one yet.
     *
     * @param userMessage - The user's message text to send to the agent.
     * @returns The {@link ChatResponse} for this turn.
     * @throws {@link ValidationError} When the message is empty or too long, when the chat mode has
     * chat disabled or is in maintenance, or when the manager is not connected yet.
     * @example
     * ```ts
     * const chat = await agentManager.chat('What is the distance to the moon?');
     * ```
     */
    chat(userMessage: string): Promise<ChatResponse>;
    /**
     * Rates one of the agent's answers in the chat, for future analytics and insights.
     *
     * Pass `rateId` to change a rating the user already gave instead of adding another.
     *
     * @param messageId - Id of the message being rated.
     * @param score - 1 for a positive rating, -1 for a negative one.
     * @param rateId - Id of an existing rating to update; omit to create a new one.
     * @returns The created or updated {@link RatingEntity}.
     * @throws {@link ValidationError} When no chat has started, or when no message with that id is
     * in the transcript.
     */
    rate(messageId: string, score: 1 | -1, rateId?: string): Promise<RatingEntity>;
    /**
     * Removes a rating the user gave to an answer in the chat.
     *
     * @param id - id of Rating entity.
     * @returns The {@link RatingEntity} that was deleted.
     * @throws {@link ValidationError} When no chat has started.
     */
    deleteRate(id: string): Promise<RatingEntity>;
    /**
     * Submits end-of-call feedback for the whole conversation.
     *
     * Separate from {@link AgentManager.rate | rate()}, which scores a single answer. Collect it
     * when the user ends the call, using the agent's end-of-call feedback configuration.
     *
     * @param rating - integer score from 1 to 5
     * @param answer - optional free-text answer
     * @returns The stored {@link SubmitFeedbackResponse}.
     * @throws {@link ValidationError} When no chat has started.
     */
    submitFeedback(rating: number, answer?: string): Promise<SubmitFeedbackResponse>;
    /**
     * Makes the agent stream back a video based on the text or audio file you provide.
     *
     * Unlike {@link AgentManager.chat | chat()} the agent's LLM is not involved, so this is how you
     * script greetings and canned lines. Pass a plain string as a shorthand for a text script. See
     * {@link SupportedStreamScript}, {@link TextStreamScript} and {@link AudioStreamScript}. Text
     * scripts also accept an optional `sentiment`, for Expressive (V4) agents only; if the
     * requested sentiment is not supported by the agent, the default sentiment is used.
     *
     * @see [Create a video stream](https://docs.d-id.com/reference/createvideoagentstream) — the request
     * sent for Talks (V2) and Clips (V3) agents.
     * @see [Control the Agent](https://docs.d-id.com/docs/livekit-commands) — the `did.speak` command
     * sent over the data channel for Expressive (V4) agents.
     * @param payload - A text or audio script, or a string treated as the text to speak.
     * @returns The {@link SendStreamPayloadResponse} for the video that was produced, or the same
     * response with `duration` `0` and an empty `video_id` when the call produced no discrete video
     * — on Expressive (V4) agents, and in a text-only chat mode.
     * @throws {@link ValidationError} When the manager is not connected to a stream yet.
     * @example Text
     * ```ts
     * const speak = await agentManager.speak({
     *     type: 'text',
     *     input: "Hi! I'm Alice!",
     * });
     * ```
     * @example Text with sentiment (Expressive (V4) agents)
     * ```ts
     * const speak = await agentManager.speak({
     *     type: 'text',
     *     input: "Hi! I'm Alice!",
     *     sentiment: 'friendly',
     * });
     * ```
     * @example Audio file
     * ```ts
     * const speak = await agentManager.speak({
     *     type: 'audio',
     *     audio_url: 'http://www.yourwebsite.com/audio.mp3',
     * });
     * ```
     */
    speak(payload: SupportedStreamScript | string): Promise<SendStreamPayloadResponse>;
    /**
     * Switches the chat to another mode.
     *
     * Anything other than {@link ChatMode.Functional} disconnects the stream, since those modes do
     * not produce video. {@link AgentManagerCallbacks.onModeChange | onModeChange} fires once the
     * change has been applied; passing the mode already in effect does nothing.
     *
     * @param mode - The {@link ChatMode} to switch to.
     */
    changeMode(mode: ChatMode): void;

    /**
     * Adds properties to every analytics event the SDK sends from now on.
     *
     * The same thing
     * {@link AgentManagerOptions.mixpanelAdditionalProperties | mixpanelAdditionalProperties} does
     * at creation time, for values you only learn later.
     *
     * @param properties - Flat json object with properties that will be added to analytics events
     * fired from the sdk.
     */
    enrichAnalytics(properties: Record<string, unknown>): void;

    /**
     * Interrupts the current video stream mid-playback, so the user can talk over the agent.
     *
     * Supported for Fluent streams (V3 Pro Avatars) and all Expressive (V4) agents. It returns
     * without doing anything when the stream does not support interrupting at all; past that the
     * behaviour differs by agent type. On Expressive (V4) agents it is a no-op when there is
     * nothing to interrupt. On Talks (V2) and Clips (V3) agents it throws when no video is playing
     * or the stream is not Fluent — and by then the last message has already been marked
     * interrupted, so check
     * {@link AgentManager.getIsInterruptAvailable | getIsInterruptAvailable()} and
     * {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange} first.
     *
     * The interrupted message is marked as such in the next
     * {@link AgentManagerCallbacks.onNewMessage | onNewMessage}.
     *
     * @param interrupt - What caused the interruption, as an {@link Interrupt}: `text`, `audio`,
     * `click` or `manual`. Expressive (V4) agents drop `text` interrupts, because the orchestrator
     * does not cancel the in-flight answer for them.
     * @throws Error On Talks (V2) and Clips (V3) agents, when no video is currently playing or the
     * stream is not a Fluent stream.
     */
    interrupt(interrupt: Interrupt): void;

    /**
     * Switches the speech-to-text language in the middle of a session.
     *
     * Expressive (V4) agents only, after {@link AgentManager.connect | connect()}; otherwise the
     * returned promise rejects.
     *
     * @param language - Language name or BCP-47 code (e.g. "English" or "en-US")
     * @returns Resolves once the new language has been sent to the agent.
     */
    setSttLanguage(language: string): Promise<void>;

    /**
     * Sends a JSON payload to the agent over a data-channel topic.
     *
     * Use it for application-specific messages that are not speech, such as telling a presentation
     * to change slide. Expressive (V4) agents only, after {@link AgentManager.connect | connect()};
     * otherwise the returned promise rejects.
     *
     * @param topic - Data-channel topic to send on. {@link PublicDataChannelTopic} is exported from
     * the package root and lists every topic this method accepts.
     * @param payload - Plain object, serialized as JSON
     * @returns Resolves once the payload has been sent.
     * @example
     * ```ts
     * import { PublicDataChannelTopic } from '@d-id/client-sdk';
     *
     * await agentManager.sendDataChannelMessage(PublicDataChannelTopic.Presentation, {
     *     type: 'navigate',
     *     slide: 3,
     * });
     * ```
     */
    sendDataChannelMessage(topic: PublicDataChannelTopic, payload: Record<string, unknown>): Promise<void>;

    /**
     * Registers a handler for a client tool, run in the browser when the agent's LLM calls it.
     *
     * The handler executes on the client and its result is returned to the LLM. Register the
     * handlers before {@link AgentManager.connect | connect()} so the agent can call
     * them from the moment the session starts; registering the same name again replaces the
     * handler. Progress is reported through
     * {@link AgentManagerCallbacks.onToolEvent | onToolEvent}.
     *
     * @param name - Tool name (must match the tool name defined in the agent config)
     * @param handler - Async function receiving args, must return a JSON string (max 15KiB). See
     * {@link ClientToolHandler}.
     */
    registerClientTool(name: string, handler: ClientToolHandler): void;

    /**
     * Removes a previously registered client tool handler.
     *
     * After this the agent's calls to that tool fail rather than reaching your code.
     *
     * @param name - Tool name to unregister
     */
    unregisterClientTool(name: string): void;
}
