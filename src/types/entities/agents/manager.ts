import { SttTokenResponse } from '@sdk/types';
import { Auth } from '@sdk/types/auth';
import { ErrorContext } from '@sdk/types/error-context';
import {
    AgentActivityState,
    ClientToolHandler,
    CompatibilityMode,
    ConnectionState,
    ConnectivityState,
    DataChannelTopic,
    RunningToolCall,
    SpeakResponse,
    StreamCreatedInfo,
    StreamEvents,
    StreamType,
    StreamingState,
    ToolEventCallback,
} from '@sdk/types/stream';
import { SpeakScript } from '@sdk/types/stream-script';
import { Agent } from './agent';
import { ChatMode, ChatResponse, InterruptOptions, Message, Rating, SubmitFeedbackResponse } from './chat';

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
 * Pass the object as {@link AgentManagerOptions.callbacks}. Every handler is optional in the type,
 * but {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} is required in practice
 * for any chat mode that streams video — without it there is nothing to render the agent into, and
 * {@link createAgentManager} rejects. Every handler is called from the SDK's own event handling,
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
 * The whole object is captured once, by {@link createAgentManager}, and the manager works from its
 * own copy — assigning a handler to the object you passed afterwards has no effect, and neither
 * does replacing {@link AgentManagerOptions.callbacks | options.callbacks}. Give each handler a
 * stable identity that reads the current state rather than closing over it: in React, keep the
 * state in a ref and read `ref.current` inside the handler.
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
    onConnectionStateChange?: (state: ConnectionState, reason?: string) => void;
    /**
     * Called when the streamed video starts and stops, so the video element can switch source.
     *
     * Triggered by {@link AgentManager.chat | chat()} and {@link AgentManager.speak | speak()}. On
     * `STOP` point the element at the agent's idle video ({@link Agent.idle_video}); on `START` put
     * the stream handed to {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} back
     * on it.
     *
     * This is the authoritative "is the agent speaking" signal on a **legacy** stream — a Talks
     * (V2) agent, or a Clips (V3) agent that did not ask for
     * {@link StreamOptions.fluent | fluent} — because
     * {@link AgentManagerCallbacks.onAgentActivityStateChange | onAgentActivityStateChange} reports
     * nothing there but a final {@link AgentActivityState.Idle | Idle} on disconnect. On a fluent
     * stream, and on every Expressive (V4) session, both fire and they answer different questions:
     * this one follows the video itself (the frames arriving on the track), while
     * `onAgentActivityStateChange` follows what the agent says it is doing, which is what to drive
     * a typing indicator or an input lock from. Use {@link AgentManager.getStreamType | getStreamType()}
     * to tell the two cases apart.
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
    onVideoStateChange?: (state: StreamingState) => void;
    /**
     * Called with the media stream carrying the agent's video and audio.
     *
     * This is the one callback a video session cannot work without: assign the value to the
     * `srcObject` of your `<video>` element, and keep a reference to it, because
     * {@link AgentManagerCallbacks.onVideoStateChange | onVideoStateChange} has to put it back
     * after the idle video has been shown. Triggered by
     * {@link AgentManager.connect | connect()}, {@link AgentManager.reconnect | reconnect()} and
     * {@link AgentManager.disconnect | disconnect()}.
     *
     * Optional only for the chat modes that never stream video — {@link ChatMode.TextOnly},
     * {@link ChatMode.Playground} and {@link ChatMode.Maintenance} — so a text-only application
     * does not have to supply a stub. {@link createAgentManager} rejects with a
     * {@link ValidationError} when it is missing in any other mode, {@link ChatMode.Off} and
     * {@link ChatMode.DirectPlayback} included: those two create no chat but still stream the
     * agent's video. {@link AgentManager.connect | connect()} checks it again against the mode in
     * effect then, so a manager created in a text-only mode and later moved into a video mode with
     * {@link AgentManager.changeMode | changeMode()} rejects rather than opening a stream with
     * nothing to render it into.
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
    onSrcObjectReady?: (srcObject: MediaStream) => void;
    /**
     * Called with the whole chat transcript every time a message is added or updated.
     *
     * Triggered by {@link AgentManager.chat | chat()}, by {@link AgentManager.speak | speak()} for
     * text scripts, and as the agent's answer streams in. It also fires once while the manager is
     * created, with whatever {@link AgentManagerOptions.initialMessages | initialMessages} were
     * given, and again on every {@link AgentManager.connect | connect()} after the first — both
     * with type `answer`. The array is a fresh copy on each call, oldest message first; every
     * {@link Message} carries an `id`, a `role` of `user` or `assistant` (the agent), its `content`
     * and a `createdAt` timestamp.
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
    onNewMessage?: (messages: Message[], type: 'answer' | 'partial' | 'user') => void;
    /**
     * Called when a chat is created for this session.
     *
     * A chat is created while {@link AgentManager.connect | connect()} runs, and lazily on the
     * first {@link AgentManager.chat | chat()} when none exists yet. Store the id if you want to
     * correlate the conversation with your own records.
     *
     * On Talks (V2) and Clips (V3) agents the id comes from the Agents API. On Expressive (V4)
     * agents the SDK derives it from the session id as `cht_<sessionId>`, which is the same id the
     * Agents API stores the conversation under — so it correlates with D-ID's own records either
     * way.
     *
     * @param chatId - Id of the chat that was just created.
     */
    onNewChat?: (chatId: string) => void;
    /**
     * Called when the chat mode changes.
     *
     * Fires after {@link AgentManager.changeMode | changeMode()}, and when the server answers with
     * a different mode than the one requested (for example {@link ChatMode.Maintenance}).
     *
     * @param mode - The {@link ChatMode} now in effect.
     */
    onModeChange?: (mode: ChatMode) => void;
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
    onConnectivityStateChange?: (state: ConnectivityState) => void;
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
     * @param error - The error that occurred. Narrow it with {@link isDIDError} and branch on
     * {@link BaseError.kind | kind}; {@link BaseError.toJson | toJson()} is what to log.
     * @param errorData - Where the failure happened, as an {@link ErrorContext}: the endpoint and
     * method for a failed request, the session or stream id for a failure on the stream. Every
     * field is optional and nothing else is passed — in particular not the request body, which
     * carries the end user's own message.
     * @example
     * ```ts
     * onError(error, errorData) {
     *     reportToYourErrorService({
     *         ...(isDIDError(error) ? error.toJson() : { message: error.message }),
     *         ...errorData,
     *     });
     * }
     * ```
     */
    onError?: (error: Error, errorData?: ErrorContext) => void;
    /**
     * Called when the agent moves between idle, loading, talking and running a tool.
     *
     * Use it to drive a typing indicator or to disable input while the agent is busy. The full set
     * of states is reported for Expressive (V4) agents only. Talks (V2) and Clips (V3) agents
     * report just {@link AgentActivityState.Talking | Talking} and
     * {@link AgentActivityState.Idle | Idle}, and only on fluent streams, plus a final
     * {@link AgentActivityState.Idle | Idle} when the connection closes.
     *
     * It is the authoritative "is the agent speaking" signal wherever it reports at all — an
     * Expressive (V4) session or a fluent stream — because it comes from the agent rather than from
     * the video track, so it also covers thinking and tool calls, which produce no video.
     * On a **legacy** stream it reports nothing, so use
     * {@link AgentManagerCallbacks.onVideoStateChange | onVideoStateChange} there; that is the
     * branch every consumer otherwise writes for itself, keyed on
     * {@link AgentManager.getStreamType | getStreamType()}.
     *
     * @param state - The {@link AgentActivityState} the agent has moved to.
     */
    onAgentActivityStateChange?: (state: AgentActivityState) => void;
    /**
     * Called once per session when the stream has been created on the server.
     *
     * Fires before the connection reaches {@link ConnectionState.Connected | 'connected'}. The ids
     * are useful when correlating a session with D-ID support or with your own logs.
     *
     * @param stream - The new stream's `streamId`, `sessionId` and `agentId`.
     */
    onStreamCreated?: (stream: StreamCreatedInfo) => void;
    /**
     * Called when the agent starts, finishes or fails a tool call.
     *
     * Expressive (V4) agents only. The handler takes two arguments and returns nothing: `event`,
     * one of {@link ToolCallEvent.Started}, {@link ToolCallEvent.Done} or
     * {@link ToolCallEvent.Error}; and `data`, the payload that event narrows to —
     * {@link ToolCallStartedPayload}, {@link ToolCallDonePayload} or
     * {@link ToolCallErrorPayload} respectively. The overloads that do the narrowing are on
     * {@link ToolEventCallback}, with an example handler.
     */
    onToolEvent?: ToolEventCallback;
    /**
     * Called when the agent becomes interruptible, or stops being interruptible.
     *
     * Expressive (V4) agents only, and about whether interrupting is allowed *right now*: it goes
     * `false` while a `blocking` client tool call is outstanding, because the agent is suspended
     * waiting for it, and back to `true` when the call finishes. That is a different question from
     * {@link AgentManager.isInterruptAvailable | isInterruptAvailable()}, which says whether
     * the session supports interrupting at all. Use this one to enable or disable an interrupt
     * button. Talks (V2) and Clips (V3) agents never report a change.
     */
    onInterruptibleChange?: (
        /** `true` while there is something to interrupt, `false` while there is not. */
        interruptible: boolean
    ) => void;
    /**
     * Called whenever the set of tool calls running in the session changes.
     *
     * Expressive (V4) agents only. Fires with an empty array on disconnect, so a spinner driven by
     * this callback always clears. Each entry is a {@link RunningToolCall}.
     */
    onRunningToolCallsChange?: (
        /** Every tool call running right now, empty when none is. */
        calls: readonly RunningToolCall[]
    ) => void;
}

/**
 * Transport settings applied when the stream is created.
 *
 * Talks (V2) and Clips (V3) agents only. Expressive (V4) agents manage transport settings
 * automatically and ignore these options. Pass the object as
 * {@link AgentManagerOptions.streamOptions}; every field is optional.
 *
 * @category Streaming Options
 */
export interface StreamOptions {
    /**
     * Which video codec the stream negotiates.
     *
     * See {@link CompatibilityMode}.
     *
     * @default auto
     */
    compatibilityMode?: CompatibilityMode;

    /**
     * Whether the stream plays a warmup video while the connection settles.
     *
     * With it on the server plays a short warmup video as soon as the connection is up, and the
     * SDK holds back {@link ConnectionState.Connected | 'connected'} — and so the resolution of
     * {@link AgentManager.connect | connect()} — until that video has played out. Without it,
     * `'connected'` is reported as soon as the data channel opens. The application sees nothing of
     * the warmup video itself beyond the delay; it is not distinguishable from any other. A fluent
     * stream ignores the option — the warmup only runs on legacy streams (see
     * {@link StreamOptions.fluent | fluent}).
     *
     * @default false
     */
    streamWarmup?: boolean;

    /**
     * How long the session may sit idle between messages before the server ends it, in seconds.
     *
     * Up to 300, and only for accounts whose plan allows it. When the session does time out,
     * {@link AgentManagerCallbacks.onConnectionStateChange | onConnectionStateChange} reports
     * {@link ConnectionState.Disconnected | 'disconnected'} with the reason
     * {@link StreamEndReason.Inactivity | 'inactivity'}. Leave it out and the server decides.
     */
    sessionTimeout?: number;

    /**
     * Whether to request a fluent stream.
     *
     * `true` streams one video for both the idle and talking states; `false` uses the legacy mode,
     * where the application swaps between two video elements. Clips (V3) agents built on a Pro
     * avatar; always on for Expressive (V4). A fluent stream is also what makes
     * {@link AgentManager.interrupt | interrupt()} available.
     *
     * @default false
     */
    fluent?: boolean;
}

/**
 * What the SDK reports about the session, and where it goes.
 *
 * Pass it as {@link AgentManagerOptions.analytics}; every field is optional, and leaving the whole
 * object out reports to D-ID's own project.
 *
 * The SDK posts an event to Mixpanel for each step of a session — connect, reconnect and
 * disconnect, every message sent and answered, every {@link AgentManager.speak | speak()}, mode
 * change, rating, feedback, tool call, video start and stop, interrupt and error. Each event
 * carries the agent id, the visitor id derived from
 * {@link AgentManagerOptions.externalId | externalId}, the page URL, the screen size, the user
 * agent, the SDK version and whatever
 * {@link AnalyticsOptions.additionalProperties | additionalProperties} added. **Conversation text
 * is included too:** the agent's answer on `agent-message-received`, and the script on
 * `agent-speak`. Set {@link AnalyticsOptions.enabled | enabled: false} to send nothing at all.
 *
 * Events that fail to post are buffered in memory (at most 50) and retried when the tab comes back
 * online or becomes visible.
 *
 * @example Send the SDK's events to your own project, tagged with your plan
 * ```ts
 * const agentManager = await sdk.createAgentManager('agt_fumf1234', {
 *     auth: { type: 'key', clientKey: 'YOUR_CLIENT_KEY' },
 *     callbacks,
 *     analytics: { mixpanelKey: 'YOUR_MIXPANEL_TOKEN', additionalProperties: { plan: 'pro' } },
 * });
 * ```
 * @category Agent Manager
 */
export interface AnalyticsOptions {
    /**
     * Whether the SDK reports usage analytics at all. Set it to `false` to send nothing.
     *
     * @default true
     */
    enabled?: boolean;
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
     * later with {@link AgentManager.enrichAnalytics | enrichAnalytics()}. A `plan` property here
     * is also forwarded to the Agents API as end-user data when a Talks (V2) or Clips (V3) stream
     * is created.
     */
    additionalProperties?: Record<string, unknown>;
}

/**
 * Everything {@link createAgentManager} needs to reach an agent and report back to the application.
 *
 * {@link AgentManagerOptions.auth | auth} and {@link AgentManagerOptions.callbacks | callbacks} are
 * required; the rest have defaults that suit a browser application talking to D-ID production.
 *
 * {@link createAgentManager} reads the object once, at creation, and never writes to it: the
 * manager works from its own copy, so one options object can create two managers, and a property
 * you read back afterwards is still the one you set. The same means a handler assigned to
 * {@link AgentManagerOptions.callbacks | callbacks} after the manager exists is not picked up —
 * give the callback a stable identity and dispatch inside it instead.
 *
 * @category Agent Manager
 */
export interface AgentManagerOptions {
    /**
     * Credentials used for every request the SDK makes on the application's behalf.
     *
     * Use `{ type: 'key', clientKey }` in a browser: a client key is scoped to one agent and to
     * the domains you allowed, so it is the only shape that is safe to ship in a page. See
     * {@link Auth}.
     */
    auth: Auth;
    /**
     * Handlers the SDK calls as the connection, the video stream and the chat change state.
     *
     * See {@link AgentManagerCallbacks}.
     * {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} is what connects the
     * streamed media to your video element, so every chat mode that streams video needs it. The
     * handlers are captured at creation, so replacing one on this object later has no effect.
     */
    callbacks: AgentManagerCallbacks;
    /**
     * How the agent answers: with a streamed video, as text only, or not at all.
     *
     * See {@link ChatMode}. It can be changed later with
     * {@link AgentManager.changeMode | changeMode()}. {@link ChatMode.Off} and
     * {@link ChatMode.DirectPlayback} are supported on Talks (V2) and Clips (V3) agents only.
     *
     * @default ChatMode.Functional
     * @throws {@link ValidationError} From {@link createAgentManager}, when the agent is Expressive
     * (V4) and the mode is {@link ChatMode.Off} or {@link ChatMode.DirectPlayback}.
     */
    mode?: ChatMode;
    /**
     * Base URL of the D-ID Agents API.
     *
     * Advanced. Points the SDK at another D-ID environment. Production applications do not set
     * this. Every REST call the manager makes — agent lookup, chat, ratings, stream creation — is
     * addressed against it.
     *
     * @defaultValue D-ID's production Agents API.
     */
    baseURL?: string;
    /**
     * URL of the D-ID notifications web socket.
     *
     * Advanced. Points the SDK at another D-ID environment. Production applications do not set
     * this. Only opened in the chat modes that stream the agent's answer, so it has no effect in
     * {@link ChatMode.DirectPlayback | DirectPlayback} or {@link ChatMode.Off | Off}.
     *
     * @defaultValue D-ID's production notifications web socket.
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
     * What the SDK reports about the session, and where it goes.
     *
     * See {@link AnalyticsOptions}. Reporting is on unless you turn it off with
     * `analytics: { enabled: false }`.
     */
    analytics?: AnalyticsOptions;
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
     * See {@link StreamOptions}. Talks (V2) and Clips (V3) agents only. Expressive (V4) agents
     * manage transport settings automatically.
     */
    streamOptions?: StreamOptions;
    /**
     * Messages the chat starts with, for example a transcript restored from your own storage.
     *
     * They are delivered to {@link AgentManagerCallbacks.onNewMessage | onNewMessage} so the UI can
     * render them. On Talks (V2) and Clips (V3) agents they are also sent as context with the next
     * {@link AgentManager.chat | chat()} request. See {@link Message}.
     *
     * A row from your own storage is enough: {@link Message.parts | parts} and
     * {@link Message.createdAt | createdAt} are optional, and the SDK builds the parts from
     * `content` with {@link parseMessageParts} for every message that arrives without them, so a
     * transcript restored from the text alone still renders. A non-empty `parts` array is kept as
     * given.
     *
     * @example Restoring rows that carry only the message text
     * ```ts
     * const initialMessages = stored.map(({ id, role, content }) => ({ id, role, content }));
     * ```
     */
    initialMessages?: Message[];
    /**
     * Whether the server keeps the chat so it can be resumed in a later session.
     *
     * Without persistence a chat lives only as long as the connection.
     * {@link AgentManager.reconnect | reconnect()} normally continues the same chat either way —
     * see the caveat there for Expressive (V4) agents.
     *
     * Off unless you set it, on every agent type.
     *
     * @default false
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
 * Two properties, {@link AgentManager.agent | agent} and
 * {@link AgentManager.starterMessages | starterMessages}, are readable as soon as the manager
 * exists; everything else is a method. Some methods work only with some avatar types: each one
 * says so, and {@link AgentAvatar} is where the session's tier is read from.
 *
 * The manager's own state is readable at any time:
 * {@link AgentManager.getChatMode | getChatMode()},
 * {@link AgentManager.getConnectionState | getConnectionState()} and
 * {@link AgentManager.getSessionInfo | getSessionInfo()} answer with what the matching callback
 * last reported, so nothing has to be mirrored in application state.
 *
 * Every method that reaches the Agents API can reject with an {@link HttpError} when the request
 * comes back non-2xx, or a {@link NetworkError} when it never reaches the server; the individual
 * `@throws` entries below name the errors that are specific to each method.
 *
 * @category Agent Manager
 */
export interface AgentManager {
    /**
     * The agent this manager is connected to, as the Agents API returned it.
     *
     * Fetched once while the manager is created, so it is available before
     * {@link AgentManager.connect | connect()}. Useful for rendering the agent's name, thumbnail
     * and {@link Agent.idle_video | idle_video}. See {@link Agent}.
     *
     * Read-only: the property cannot be reassigned, and the SDK never replaces it — the manager
     * talks to the agent it was created for, for its whole life.
     */
    readonly agent: Agent;
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
     * True on a fluent stream — a Clips (V3) agent built on a Pro avatar, or any Expressive (V4)
     * agent — once connected. This says the stream supports interrupting at all;
     * {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange} says whether
     * interrupting is allowed right now.
     *
     * @returns `true` when {@link AgentManager.interrupt | interrupt()} can do anything.
     */
    isInterruptAvailable(): boolean;

    /**
     * The agent's starter messages.
     *
     * Suggested openers to offer the user as buttons; empty when the agent defines none. Available
     * before {@link AgentManager.connect | connect()}.
     *
     * Read-only, and a copy of {@link Agent.starter_message} rather than the same array, so
     * sorting or filtering a local copy of it cannot change what
     * {@link AgentManager.agent | agent} reports.
     */
    readonly starterMessages: readonly string[];
    /**
     * Fetches a short-lived token for the D-ID speech-to-text service.
     *
     * The SDK sends the request whenever it is called, connected or not; the service decides
     * whether to issue a token for the agent.
     *
     * @returns The {@link SttTokenResponse} for this agent.
     * @throws {@link HttpError} When the service does not answer with a token, or the request comes
     * back non-2xx for any other reason.
     * @throws {@link NetworkError} When the request never reaches the server.
     */
    getSttToken(): Promise<SttTokenResponse>;
    /**
     * Returns the chat mode in effect right now.
     *
     * The same value {@link AgentManagerCallbacks.onModeChange | onModeChange} last reported, and
     * the one every mode guard in the SDK reads. It is not always the mode that was asked for: the
     * server can answer {@link AgentManager.connect | connect()} with a different mode, which the
     * manager adopts, and a failed connection leaves the session in
     * {@link ChatMode.Maintenance | Maintenance}. Use it instead of mirroring `onModeChange` in
     * your own state.
     *
     * @returns The current {@link ChatMode}; before {@link AgentManager.connect | connect()}, the
     * mode the manager was created with ({@link ChatMode.Functional} by default).
     * @example
     * ```ts
     * if (agentManager.getChatMode() === 'maintenance') {
     *     showBanner('The agent is temporarily unavailable.');
     * }
     * ```
     */
    getChatMode(): ChatMode;
    /**
     * Returns the connection state the manager last reported.
     *
     * The same value
     * {@link AgentManagerCallbacks.onConnectionStateChange | onConnectionStateChange} was last
     * called with, so a component that mounts after the session is up can read the state instead of
     * waiting for the next change.
     *
     * @returns The current {@link ConnectionState}; {@link ConnectionState.New | 'new'} before the
     * first {@link AgentManager.connect | connect()}.
     * @example
     * ```ts
     * const canChat = agentManager.getConnectionState() === 'connected';
     * ```
     */
    getConnectionState(): ConnectionState;
    /**
     * Returns the ids of the session that is open, for support and for your own logs.
     *
     * The same {@link StreamCreatedInfo} that
     * {@link AgentManagerCallbacks.onStreamCreated | onStreamCreated} delivered for this session.
     *
     * @returns The open session's `streamId`, `sessionId` and `agentId`, or `undefined` before
     * {@link AgentManager.connect | connect()} and after
     * {@link AgentManager.disconnect | disconnect()}.
     * @example
     * ```ts
     * const session = agentManager.getSessionInfo();
     * console.log('session', session?.sessionId, 'stream', session?.streamId);
     * ```
     */
    getSessionInfo(): StreamCreatedInfo | undefined;
    /**
     * Opens a new session with the agent: a new WebRTC connection, a new web socket and a new chat.
     *
     * Resolves once the connection reaches {@link ConnectionState.Connected | 'connected'}, by
     * which point {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} has been called
     * with the media stream to render.
     *
     * One session at a time: while a call is still in flight a second call returns that same
     * promise rather than opening a second session, which is what makes it safe in a React
     * StrictMode effect. Once a session exists it rejects instead — call
     * {@link AgentManager.disconnect | disconnect()} first to start a fresh conversation, or
     * {@link AgentManager.reconnect | reconnect()} to keep the current one.
     *
     * A call made while an operation is already running joins it, so it can also resolve without
     * opening a session — when a {@link AgentManager.disconnect | disconnect()} cancelled the
     * operation it joined. Read {@link AgentManager.getConnectionState | getConnectionState()} if
     * you race the two.
     *
     * @returns Resolves when the agent is connected and ready.
     * @throws {@link ValidationError} When a session is already open, or when
     * {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} was not supplied and the
     * current {@link ChatMode} streams video — which a
     * {@link AgentManager.changeMode | changeMode()} out of a text-only mode can bring about.
     * @throws {@link HttpError} When creating the stream or the chat comes back non-2xx — a client
     * key that is not authorized for the agent or the calling domain, or an account out of
     * credits. The SDK tries the initialization up to three times first, except on `429` and on an
     * out-of-credits response.
     * @throws {@link NetworkError} When those requests never reach the server.
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
     * One session-opening operation runs at a time, teardown included, so this and
     * {@link AgentManager.connect | connect()} cannot interleave. Do not race them: a `connect()`
     * called while this is running joins *this* operation, which continues the existing chat
     * rather than starting a new one, so
     * {@link AgentManagerCallbacks.onNewChat | onNewChat} does not fire for it; the other order
     * starts a new chat, and this one continues that. Call one or the other.
     *
     * @returns Resolves when the new stream is connected.
     * @throws {@link ValidationError} When a {@link AgentManager.connect | connect()} is still in
     * flight; wait for it to settle first.
     * @throws {@link HttpError} When creating the new stream comes back non-2xx.
     * @throws {@link NetworkError} When that request never reaches the server.
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
     * agents only; on Talks (V2) and Clips (V3) agents, and before `connect()`, the returned
     * promise rejects with a {@link ValidationError}.
     *
     * @param stream - A `MediaStream` whose audio track is published to the session.
     * @returns Resolves once the track is published.
     * @throws {@link ValidationError} When the session is not an Expressive (V4) one, or
     * {@link AgentManager.connect | connect()} has not run yet.
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
     * restart. Rejects with a plain `Error` from the transport when there is no active publication
     * — fall back to {@link AgentManager.publishMicrophoneStream | publishMicrophoneStream()} in
     * that case. Expressive (V4) agents only; on Talks (V2) and Clips (V3) agents, and before
     * {@link AgentManager.connect | connect()}, the returned promise rejects with a
     * {@link ValidationError}.
     *
     * @param track - The audio track to send from now on.
     * @returns Resolves once the transport has switched to the new track.
     * @throws {@link ValidationError} When the session is not an Expressive (V4) one, or
     * {@link AgentManager.connect | connect()} has not run yet.
     */
    replaceMicrophoneTrack(track: MediaStreamTrack): Promise<void>;
    /**
     * Publishes a camera video track to the session so the agent can see the user.
     *
     * Call it after {@link AgentManager.connect | connect()} to enable vision. Expressive (V4)
     * agents only; on Talks (V2) and Clips (V3) agents, and before `connect()`, the returned
     * promise rejects with a {@link ValidationError}.
     *
     * @param stream - A `MediaStream` whose video track is published to the session.
     * @returns Resolves once the track is published.
     * @throws {@link ValidationError} When the session is not an Expressive (V4) one, or
     * {@link AgentManager.connect | connect()} has not run yet.
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
     * @throws {@link ChatCreationFailed} On Talks (V2) and Clips (V3) agents, when the session has
     * no chat yet and the Agents API answers the creation request without one.
     * @throws {@link HttpError} On Talks (V2) and Clips (V3) agents, and in
     * {@link ChatMode.Playground}, when the message request comes back non-2xx. Expressive (V4)
     * agents send the message over the data channel instead, so no HTTP request is made.
     * @throws {@link NetworkError} On Talks (V2) and Clips (V3) agents, and in
     * {@link ChatMode.Playground}, when that request never reaches the server.
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
     * Every avatar type: the rating is stored against the chat and the message.
     * {@link AgentManagerCallbacks.onNewChat | onNewChat} explains where an Expressive (V4)
     * session's chat id comes from. What differs is `messageId` — the SDK only checks that the id
     * is in the transcript it holds, and an Expressive (V4) answer that arrives over the data
     * channel without an id of its own is given a locally generated one, which D-ID's records
     * cannot be matched against. Rate the answers whose ids came from the server.
     *
     * @param messageId - Id of the message being rated.
     * @param score - 1 for a positive rating, -1 for a negative one.
     * @param rateId - Id of an existing rating to update; omit to create a new one.
     * @returns The created or updated {@link Rating}.
     * @throws {@link ValidationError} When no chat has started, or when no message with that id is
     * in the transcript.
     * @throws {@link HttpError} When the rating request comes back non-2xx.
     * @throws {@link NetworkError} When the rating request never reaches the server.
     */
    rate(messageId: string, score: 1 | -1, rateId?: string): Promise<Rating>;
    /**
     * Removes a rating the user gave to an answer in the chat.
     *
     * Every avatar type; it addresses the rating by its own id, so nothing about it differs between
     * the tiers.
     *
     * @param id - Id of the rating to remove, as returned by
     * {@link AgentManager.rate | rate()}.
     * @returns The {@link Rating} that was deleted.
     * @throws {@link ValidationError} When no chat has started.
     * @throws {@link HttpError} When the delete request comes back non-2xx.
     * @throws {@link NetworkError} When the delete request never reaches the server.
     */
    deleteRate(id: string): Promise<Rating>;
    /**
     * Submits end-of-call feedback for the whole conversation.
     *
     * Separate from {@link AgentManager.rate | rate()}, which scores a single answer. Collect it
     * when the user ends the call, using the agent's end-of-call feedback configuration.
     *
     * Every avatar type. The agent must have end-of-call feedback switched on
     * ({@link Agent.end_of_call_feedback}, {@link EndOfCallFeedbackConfig.enabled | enabled}) —
     * the Agents API rejects the request otherwise, so read the configuration before offering the
     * form. A second submission for the same conversation replaces the first.
     *
     * @param rating - The user's score for the conversation: 1, 2, 3, 4 or 5. The Agents API
     * rejects anything else, whole numbers outside the range and fractions alike.
     * @param answer - The user's free-text answer to the follow-up question, when one was asked.
     * @returns The stored {@link SubmitFeedbackResponse}.
     * @throws {@link ValidationError} When no chat has started.
     * @throws {@link HttpError} When the feedback request comes back non-2xx — including a `400`
     * when the agent does not have end-of-call feedback enabled.
     * @throws {@link NetworkError} When the feedback request never reaches the server.
     */
    submitFeedback(rating: 1 | 2 | 3 | 4 | 5, answer?: string): Promise<SubmitFeedbackResponse>;
    /**
     * Makes the agent stream back a video based on the text or audio file you provide.
     *
     * Unlike {@link AgentManager.chat | chat()} the agent's LLM is not involved, so this is how you
     * script greetings and canned lines. Pass a plain string as a shorthand for a text script. See
     * {@link SpeakScript}, {@link TextStreamScript} and {@link AudioStreamScript}. Text
     * scripts also accept an optional `sentiment`, for Expressive (V4) agents only; if the
     * requested sentiment is not supported by the agent, the default sentiment is used.
     *
     * @see [Create a video stream](https://docs.d-id.com/reference/createvideoagentstream) — the request
     * sent for Talks (V2) and Clips (V3) agents.
     * @see [Control the Agent](https://docs.d-id.com/docs/livekit-commands) — the `did.speak` command
     * sent over the data channel for Expressive (V4) agents.
     * @param payload - A text or audio script, or a string treated as the text to speak.
     * @returns The {@link SpeakResponse} for the video that was produced, or the same
     * response with `duration` `0` and an empty `videoId` when the call produced no discrete video
     * — on Expressive (V4) agents, and in a text-only chat mode.
     * @throws {@link ValidationError} When the manager is not connected to a stream yet.
     * @throws {@link HttpError} On Talks (V2) and Clips (V3) agents, when the Agents API answers
     * the request non-2xx. Expressive (V4) agents send the script over the data channel instead,
     * so no HTTP request is made.
     * @throws {@link NetworkError} On Talks (V2) and Clips (V3) agents, when that request never
     * reaches the server.
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
     *     audio_url: 'https://www.yourwebsite.com/audio.mp3',
     * });
     * ```
     */
    speak(payload: SpeakScript | string): Promise<SpeakResponse>;
    /**
     * Switches the chat to another mode.
     *
     * Anything other than {@link ChatMode.Functional} disconnects the stream, since those modes do
     * not produce video, which is why this is asynchronous: the returned promise resolves once that
     * disconnect has finished. Switching *into* {@link ChatMode.Functional} disconnects it as well
     * when the open session was built for a mode that skipped what a conversation needs — a
     * {@link ChatMode.DirectPlayback} session has neither the notifications web socket the answer
     * arrives on nor a chat to send to. Call {@link AgentManager.connect | connect()} again after
     * a change that tore the session down. {@link AgentManagerCallbacks.onModeChange | onModeChange}
     * fires once the change has been applied; passing the mode already in effect does nothing.
     *
     * @param mode - The {@link ChatMode} to switch to.
     * @returns A promise resolved when the mode is in effect and any disconnect it caused has
     * completed.
     * @throws {@link ValidationError} Rejects on Expressive (V4) agents for {@link ChatMode.Off} and
     * {@link ChatMode.DirectPlayback}, which those agents do not support.
     */
    changeMode(mode: ChatMode): Promise<void>;

    /**
     * Adds properties to every analytics event the SDK sends from now on.
     *
     * The same thing
     * {@link AnalyticsOptions.additionalProperties | analytics.additionalProperties} does at
     * creation time, for values you only learn later.
     *
     * Advanced. Calls merge, so a property sent twice takes the later value, and events already
     * sent are not changed. It has no visible effect when analytics is switched off with
     * {@link AnalyticsOptions.enabled | analytics.enabled} set to `false`, because nothing is sent
     * at all.
     *
     * @param properties - A flat JSON object whose properties are added to every analytics event
     * the SDK sends from now on.
     */
    enrichAnalytics(properties: Record<string, unknown>): void;

    /**
     * Interrupts the current video stream mid-playback, so the user can talk over the agent.
     *
     * Supported on a fluent stream — a Clips (V3) agent built on a Pro avatar, or any Expressive
     * (V4) agent. It never throws: on every agent type it returns without doing anything when
     * interrupting is not available for the session, when it is not allowed right now, and — on
     * Talks (V2) and Clips (V3) agents — when the stream is not a fluent stream or no video is
     * playing. Check {@link AgentManager.isInterruptAvailable | isInterruptAvailable()}
     * before offering the control at all; on Expressive (V4) agents
     * {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange} tracks whether it
     * is allowed right now.
     *
     * The interrupted message is marked as such in the next
     * {@link AgentManagerCallbacks.onNewMessage | onNewMessage} — but only when an interrupt was
     * actually sent. A call that finds nothing to interrupt leaves the message untouched and fires
     * no callback.
     *
     * @param options - What caused the interruption, as an {@link InterruptOptions}: `text`,
     * `audio`, `click` or `manual`. Optional — a stop button is the common case, so leaving it out
     * means `{ type: 'click' }`. Expressive (V4) agents drop `text` interrupts, because the
     * orchestrator does not cancel the in-flight answer for them.
     * @example
     * ```ts
     * stopButton.onclick = () => agentManager.interrupt();
     *
     * // The user typed over the answer instead of pressing the button.
     * agentManager.interrupt({ type: 'text' });
     * ```
     */
    interrupt(options?: InterruptOptions): void;

    /**
     * Switches the speech-to-text language in the middle of a session.
     *
     * Expressive (V4) agents only, after {@link AgentManager.connect | connect()}; otherwise the
     * returned promise rejects with a {@link ValidationError}.
     *
     * @param language - The language to transcribe in, as a name or a BCP-47 code — `"English"` or
     * `"en-US"`.
     * @returns Resolves once the new language has been sent to the agent. A room that has dropped
     * since {@link AgentManager.connect | connect()} reports a {@link StreamError} through
     * {@link AgentManagerCallbacks.onError | onError} and the promise still resolves.
     * @throws {@link ValidationError} When the session is not an Expressive (V4) one, or
     * {@link AgentManager.connect | connect()} has not run yet.
     */
    setSttLanguage(language: string): Promise<void>;

    /**
     * Sends a JSON payload to the agent over a data-channel topic.
     *
     * Use it for application-specific messages that are not speech, such as telling a presentation
     * to change slide. Expressive (V4) agents only, after {@link AgentManager.connect | connect()};
     * otherwise the returned promise rejects with a {@link ValidationError}.
     *
     * @param topic - Data-channel topic to send on. Either a {@link DataChannelTopic} member or
     * its string value — `DataChannelTopic.Presentation` and `'did.presentation'` are both
     * accepted. {@link DataChannelTopic} is exported from the package root and lists every topic
     * this method accepts.
     * @param payload - A plain object, sent as JSON.
     * @returns Resolves once the payload has been sent. A room that has dropped since
     * {@link AgentManager.connect | connect()} reports a {@link StreamError} through
     * {@link AgentManagerCallbacks.onError | onError} and the promise still resolves.
     * @throws {@link ValidationError} When the session is not an Expressive (V4) one, or
     * {@link AgentManager.connect | connect()} has not run yet.
     * @example
     * ```ts
     * import { DataChannelTopic } from '@d-id/client-sdk';
     *
     * await agentManager.sendDataChannelMessage(DataChannelTopic.Presentation, {
     *     type: 'navigate',
     *     slide: 3,
     * });
     * ```
     */
    sendDataChannelMessage(topic: `${DataChannelTopic}`, payload: Record<string, unknown>): Promise<void>;

    /**
     * Registers a handler for a client tool, run in the browser when the agent's LLM calls it.
     *
     * Expressive (V4) agents only: client tools travel on the real-time session's RPC channel,
     * which Talks (V2) and Clips (V3) agents do not have. It throws a {@link ValidationError} on
     * those rather than registering a handler the agent could never call. The check is on the
     * agent, not on the connection, so it applies before
     * {@link AgentManager.connect | connect()} too.
     *
     * The handler executes on the client and its result is returned to the LLM. Register the
     * handlers before {@link AgentManager.connect | connect()} so the agent can call
     * them from the moment the session starts; registering the same name again replaces the
     * handler. Progress is reported through
     * {@link AgentManagerCallbacks.onToolEvent | onToolEvent}.
     *
     * @param name - Name of the tool, which must match the one defined in the agent's
     * configuration.
     * @param handler - The function that runs when the agent calls the tool. It receives the
     * arguments the LLM produced and returns a JSON string of at most 15 KiB — the limit is the
     * transport's, not the SDK's, and a larger result fails the call. See
     * {@link ClientToolHandler}.
     * @throws {@link ValidationError} When the agent is a Talks (V2) or Clips (V3) one.
     */
    registerClientTool(name: string, handler: ClientToolHandler): void;

    /**
     * Removes a previously registered client tool handler.
     *
     * After this the agent's calls to that tool fail rather than reaching your code. Unlike
     * {@link AgentManager.registerClientTool | registerClientTool()} it never throws — a name that
     * was never registered, and any agent type, is a no-op — so it is safe in a cleanup path.
     *
     * @param name - Name of the tool whose handler should be removed.
     */
    unregisterClientTool(name: string): void;
}
