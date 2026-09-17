import { InternalDataChannelTopic } from '@sdk/types/stream/data-channel';
import {
    AgentManager,
    AgentManagerCallbacks,
    AgentManagerOptions,
    Chat,
    ChatMode,
    ChatResponse,
    ClientToolHandler,
    ConnectionState,
    CreateStreamOptions,
    DataChannelTopic,
    ErrorContext,
    InterruptOptions,
    Message,
    SpeakScript,
    StreamCreatedInfo,
    StreamScript,
} from '../../types';

import { rotateConnectionId } from '@sdk/auth/get-auth-header';
import { CONNECTION_RETRY_TIMEOUT_MS, MAX_CHAT_MESSAGE_LENGTH } from '@sdk/config/consts';
import { didApiUrl, didSocketApiUrl, mixpanelKey } from '@sdk/config/environment';
import { ChatCreationFailed, HttpError, ValidationError } from '@sdk/errors';
import { getRandom } from '@sdk/utils';
import { isStreamsV2Agent } from '@sdk/utils/agent';
import { isChatModeWithoutChat, isTextualChat } from '@sdk/utils/chat';
import { parseMessagePartsMemo } from '@sdk/utils/content-parser';
import { createAgentsApi } from '../../api/agents';
import { getAgentInfo, getAnalyticsInfo } from '../../utils/analytics';
import { defer } from '../../utils/defer';
import { toErrorAnalytics } from '../../utils/error-analytics';
import { retryOperation } from '../../utils/retry-operation';
import { initializeAnalytics } from '../analytics/mixpanel';
import { interruptTimestampTracker, latencyTimestampTracker } from '../analytics/timestamp-tracker';
import { createChat, getRequestHeaders } from '../chat';
import { getInitialMessages } from '../chat/intial-messages';
import { SocketManager, createSocketManager } from '../socket-manager';
import { createMessageEventQueue } from '../socket-manager/message-queue';
import { StreamingManager } from '../streaming-manager';
import { initializeStreamAndChat } from './connect-to-manager';

/**
 * Mutable state shared between the agent manager's connect/chat/stream helpers.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface AgentManagerItems {
    chat?: Chat;
    streamingManager?: StreamingManager<CreateStreamOptions>;
    socketManager?: SocketManager;
    messages: Message[];
    chatMode: ChatMode;
}

// The two chat modes that create no chat are a Talks (V2) / Clips (V3) feature.
const UNSUPPORTED_CHAT_MODE_FOR_EXPRESSIVE =
    'ChatMode.Off and ChatMode.DirectPlayback are not supported for Expressive agents';

// `onSrcObjectReady` is what puts the agent on screen, so every mode that streams video needs it.
// `Off` and `DirectPlayback` are not in the exempt set: they create no chat but do stream video.
const MISSING_SRC_OBJECT_READY =
    'callbacks.onSrcObjectReady is required in every chat mode that streams video; ' +
    'it is optional only in ChatMode.TextOnly, ChatMode.Playground and ChatMode.Maintenance';

/**
 * Creates an {@link AgentManager} for one agent: its chat, its video stream and its connections.
 *
 * Fetches the agent from the Agents API before it resolves, so the returned manager already has
 * {@link AgentManager.agent | agent} and {@link AgentManager.starterMessages | starterMessages}
 * filled in. No stream is opened until {@link AgentManager.connect | connect()} is called.
 * Two options are checked here, and both reject with a {@link ValidationError}: an Expressive (V4)
 * agent asked for {@link ChatMode.Off} or {@link ChatMode.DirectPlayback}, which only Talks (V2)
 * and Clips (V3) agents support; and
 * {@link AgentManagerOptions.callbacks | callbacks} without
 * {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} in a mode that streams video —
 * that callback is what attaches the streamed media to a video element, and only
 * {@link ChatMode.TextOnly}, {@link ChatMode.Playground} and {@link ChatMode.Maintenance} can do
 * without it. Every other bad argument surfaces later, as a {@link ValidationError} rejected by the
 * method that was called on the returned manager, such as
 * {@link AgentManager.chat | chat()} or {@link AgentManager.speak | speak()}.
 *
 * @param agent - Id of the agent to talk to: the `data-agent-id` from its Embed snippet, or the `id`
 * returned by the Agents API.
 * @param options - Credentials, callbacks and everything else the manager needs. See
 * {@link AgentManagerOptions}.
 * @returns A manager for that agent, ready to {@link AgentManager.connect | connect()}.
 * @throws {@link ValidationError} When an Expressive (V4) agent is created with
 * {@link ChatMode.Off} or {@link ChatMode.DirectPlayback}, or when
 * {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} is missing in a mode that
 * streams video.
 * @throws {@link HttpError} When the agent cannot be fetched — an unknown id, or a client key that
 * is not authorized for the agent or the calling domain.
 * @throws {@link NetworkError} When the request for the agent never reaches the server: the browser
 * is offline, DNS or TLS fails, or the request is blocked.
 *
 * @example
 * ```ts
 * import * as sdk from '@d-id/client-sdk';
 *
 * const agentManager = await sdk.createAgentManager('agt_fumf1234', {
 *     auth: { type: 'key', clientKey: 'YOUR_CLIENT_KEY' },
 *     callbacks: {
 *         // Hand the streamed media to your video element. Required in every mode that
 *         // streams video, which is every mode but TextOnly, Playground and Maintenance.
 *         onSrcObjectReady(value) {
 *             videoElement.srcObject = value;
 *         },
 *     },
 * });
 *
 * await agentManager.connect();
 * await agentManager.chat('What is the distance to the moon?');
 * ```
 *
 * @category Agent Manager
 */
export async function createAgentManager(agent: string, options: AgentManagerOptions): Promise<AgentManager> {
    // The caller's handlers, copied once: the options object is never written to, so two managers
    // built from one cannot wrap each other's `callbacks.onError`.
    const appCallbacks: AgentManagerCallbacks = { ...options.callbacks };

    let firstConnection = true;

    const mxKey = options.analytics?.mixpanelKey || mixpanelKey;
    const wsURL = options.wsURL || didSocketApiUrl;
    const baseURL = options.baseURL || didApiUrl;
    const mode = options.mode || ChatMode.Functional;

    if (!appCallbacks.onSrcObjectReady && !isTextualChat(mode)) {
        throw new ValidationError(MISSING_SRC_OBJECT_READY);
    }

    const items: AgentManagerItems = {
        messages: [],
        chatMode: mode,
    };
    const analytics = initializeAnalytics({
        token: mxKey,
        agentId: agent,
        isEnabled: options.analytics?.enabled,
        externalId: options.externalId,
        mixpanelAdditionalProperties: options.analytics?.additionalProperties,
    });

    const initTimestamp = Date.now();
    defer(() => {
        analytics.track('agent-sdk', { event: 'init' }, initTimestamp);
    });

    // The state the getters answer from.
    let connectionState: ConnectionState = ConnectionState.New;
    let sessionInfo: StreamCreatedInfo | undefined;

    // One object, built once: every reporter is handed this, so the state above has a single source
    // of truth and no handler is wrapped twice.
    const callbacks: AgentManagerCallbacks = {
        ...appCallbacks,
        onError(error: Error, errorData?: ErrorContext) {
            analytics.track('agent-error', { error: toErrorAnalytics(error) });
            appCallbacks.onError?.(error, errorData);
        },
        onConnectionStateChange(state: ConnectionState, reason?: string) {
            connectionState = state;
            appCallbacks.onConnectionStateChange?.(state, reason);
        },
        onStreamCreated(stream: StreamCreatedInfo) {
            sessionInfo = stream;
            appCallbacks.onStreamCreated?.(stream);
        },
    };

    const managerOptions: AgentManagerOptions = { ...options, callbacks };

    const agentsApi = createAgentsApi(managerOptions.auth, baseURL, callbacks.onError, managerOptions.externalId);

    const agentEntity = await agentsApi.getRuntimeById(agent);
    managerOptions.debug = managerOptions.debug || agentEntity?.advanced_settings?.ui_debug_mode;

    const isStreamsV2 = isStreamsV2Agent(agentEntity.avatar.type);

    if (isStreamsV2 && isChatModeWithoutChat(mode)) {
        throw new ValidationError(UNSUPPORTED_CHAT_MODE_FOR_EXPRESSIVE);
    }

    if (isStreamsV2) {
        // Start the transport downloading now, so `connect()` does not wait for it before it can
        // ask for a session. Dynamically, so a Talks/Clips bundle never pulls LiveKit in; a failed
        // prefetch is ignored, and `connect()` reports the failure if it is still there.
        void import('../streaming-manager/livekit-manager')
            .then(({ preloadLiveKit }) => preloadLiveKit())
            .catch(() => {});
    }

    analytics.enrich(getAgentInfo(agentEntity));

    const { onMessage, clearQueue } = createMessageEventQueue(analytics, items, managerOptions, agentEntity, reason => {
        items.socketManager?.disconnect();
        callbacks.onConnectionStateChange?.(ConnectionState.Disconnected, reason);
    });

    items.messages = getInitialMessages(managerOptions.initialMessages);

    callbacks.onNewMessage?.([...items.messages], 'answer');

    const updateVideoId = (videoId: string | null) => analytics.enrich({ videoId });

    const interrupt = (options?: InterruptOptions) => {
        // A stop button is the common case: `interrupt()` means `{ type: 'click' }`.
        const type = options?.type ?? 'click';

        const streamingManager = items.streamingManager;
        if (!streamingManager?.interruptAvailable || !streamingManager.isInterruptible) {
            return;
        }

        const sent = streamingManager.interrupt(type);
        if (!sent) {
            return;
        }

        analytics.track('agent-video-interrupt', {
            type,
            video_duration_to_interrupt: interruptTimestampTracker.get(true),
            message_duration_to_interrupt: latencyTimestampTracker.get(true),
        });

        // Only flag the message once the interrupt was actually sent.
        const lastMessage = items.messages[items.messages.length - 1];
        if (!lastMessage) {
            return;
        }

        lastMessage.interrupted = true;
        callbacks.onNewMessage?.([...items.messages], 'answer');
    };

    const clientToolHandlers = new Map<string, ClientToolHandler>();

    // The reason travels in a plain `Error`: only the LiveKit manager loads `livekit-client`, and
    // it turns this into the `RpcError` the transport forwards to the agent.
    function createRpcHandler(toolName: string) {
        return async (data: { payload: string }): Promise<string> => {
            const handler = clientToolHandlers.get(toolName);
            if (!handler) {
                throw new Error(`No handler registered for client tool: ${toolName}`);
            }

            const args = JSON.parse(data.payload);

            return handler(args);
        };
    }

    function flushClientToolsToRoom() {
        for (const [name] of clientToolHandlers) {
            items.streamingManager?.unregisterRpcMethod?.(name);
            items.streamingManager?.registerRpcMethod?.(name, createRpcHandler(name));
        }
    }

    function registerClientTool(name: string, handler: ClientToolHandler): void {
        // Client tools travel over the LiveKit RPC channel, which only an Expressive (V4) session
        // has.
        if (!isStreamsV2) {
            throw new ValidationError('registerClientTool is only available on Expressive (V4) agents');
        }

        const isNew = !clientToolHandlers.has(name);
        clientToolHandlers.set(name, handler);
        if (isNew) {
            items.streamingManager?.registerRpcMethod?.(name, createRpcHandler(name));
        }
    }

    function unregisterClientTool(name: string): void {
        clientToolHandlers.delete(name);
        items.streamingManager?.unregisterRpcMethod?.(name);
    }

    const loadedTimestamp = Date.now();
    defer(() => {
        analytics.track('agent-sdk', { event: 'loaded', ...getAnalyticsInfo(agentEntity) }, loadedTimestamp);
    });

    // One session-opening operation at a time: a second run would overwrite
    // `items.streamingManager` and leave the first session open on the server. Every path that
    // opens a session goes through `runOp`, so a racing caller joins the one already running.
    let opInFlight: Promise<void> | undefined;

    // Set by `disconnect()` while an operation is running; the operation checks it once it has a
    // session and tears down what it built, so `disconnect()` never waits for a connect.
    let disconnectRequested = false;

    function runOp(body: () => Promise<void>): Promise<void> {
        disconnectRequested = false;

        // `.then(body)`, not `body()`: `opInFlight` must be set before the body's synchronous
        // prefix runs, or a handler it calls would start a second operation.
        opInFlight = Promise.resolve()
            .then(body)
            .finally(() => {
                opInFlight = undefined;
            });

        return opInFlight;
    }

    function runConnect(newChat: boolean): Promise<void> {
        if (opInFlight) {
            return opInFlight;
        }

        return runOp(() => connect(newChat));
    }

    async function connect(newChat: boolean) {
        // A `disconnect()` that arrived before this leg started — the second leg of a `reconnect()`,
        // say. Opening a session now would hand back one the caller believes it closed.
        if (disconnectRequested) {
            return;
        }

        rotateConnectionId();
        callbacks.onConnectionStateChange?.(ConnectionState.Connecting);

        latencyTimestampTracker.reset();

        if (newChat && !firstConnection) {
            delete items.chat;

            callbacks.onNewMessage?.([...items.messages], 'answer');
        }

        const websocketPromise = sessionNeedsSocket(items.chatMode)
            ? createSocketManager(
                  managerOptions.auth,
                  wsURL,
                  { onMessage, onError: callbacks.onError },
                  managerOptions.externalId
              )
            : Promise.resolve(undefined);
        const initPromise = retryOperation(
            () =>
                initializeStreamAndChat(
                    agentEntity,
                    {
                        ...managerOptions,
                        mode: items.chatMode,
                        callbacks: {
                            ...callbacks,
                            onVideoIdChange: updateVideoId,
                            onMessage,
                        },
                        rpcMethods: new Map([...clientToolHandlers.keys()].map(name => [name, createRpcHandler(name)])),
                    },
                    agentsApi,
                    analytics,
                    items.chat
                ),
            {
                limit: 3,
                timeout: CONNECTION_RETRY_TIMEOUT_MS,
                timeoutErrorMessage: 'Timeout initializing the stream',
                shouldRetryFn: (error: any) =>
                    error?.message !== 'Could not connect' &&
                    !(
                        error instanceof HttpError &&
                        (error.status === 429 || error.code === 'InsufficientCreditsError')
                    ),
                delayMs: 1000,
            }
        ).catch(e => {
            // `Promise.all` below would discard a socket that has already opened, and nothing else
            // holds a reference to it — `items.socketManager` is only assigned on the happy path.
            websocketPromise.then(socket => socket?.disconnect()).catch(() => {});

            applyMode(ChatMode.Maintenance);
            callbacks.onConnectionStateChange?.(ConnectionState.Fail);
            throw e;
        });

        const previousChatId = items.chat?.id;
        const [socketManager, { streamingManager, chat }] = await Promise.all([websocketPromise, initPromise]);

        const isNewChat = !!chat && chat.id !== previousChatId;
        if (chat && isNewChat) {
            callbacks.onNewChat?.(chat.id);
        }

        items.streamingManager = streamingManager;
        items.socketManager = socketManager;
        items.chat = chat;

        // A `disconnect()` that arrived while this was connecting: tear down what was just built
        // rather than leaving a session the caller believes it closed.
        if (disconnectRequested) {
            await disconnect();
            return;
        }

        flushClientToolsToRoom();

        firstConnection = false;

        analytics.enrich({
            chatId: chat?.id,
            streamId: streamingManager?.streamId,
            mode: items.chatMode,
        });

        // Only a chat this connect created says anything about this session's mode; one carried
        // over from an earlier connect still holds the mode it was created in.
        const serverMode = (isNewChat ? chat?.chat_mode : undefined) ?? items.chatMode;
        if (isStreamsV2 && isChatModeWithoutChat(serverMode)) {
            // The session is up; keep the mode we have rather than failing a working connection.
            console.warn(`[AgentManager] Ignoring chat mode "${serverMode}": ${UNSUPPORTED_CHAT_MODE_FOR_EXPRESSIVE}`);
            return;
        }

        await applyMode(serverMode);
    }

    async function disconnect() {
        items.socketManager?.disconnect();
        await items.streamingManager?.disconnect();

        delete items.streamingManager;
        delete items.socketManager;
        sessionInfo = undefined;

        callbacks.onConnectionStateChange?.(ConnectionState.Disconnected);
    }

    // The answers arrive on the notifications web socket, except on an Expressive agent (data
    // channel) and in DirectPlayback (no conversation at all).
    function sessionNeedsSocket(mode: ChatMode): boolean {
        return !isStreamsV2 && mode !== ChatMode.DirectPlayback;
    }

    // A session built for one mode can be missing what another needs: `connect()` builds the socket
    // and the chat from the mode it ran in.
    function sessionSupports(mode: ChatMode): boolean {
        const needsChat = !isChatModeWithoutChat(mode);

        return (!sessionNeedsSocket(mode) || !!items.socketManager) && (!needsChat || !!items.chat);
    }

    // The mode change itself, without the Expressive guard: the modes the server reports go
    // through here too, and those must not fail a connection that is otherwise fine.
    async function applyMode(mode: ChatMode) {
        if (mode !== items.chatMode) {
            analytics.track('agent-mode-change', { mode });
            items.chatMode = mode;

            // Every mode but Functional tears the stream down — and so does Functional when the
            // open session cannot carry a conversation (a DirectPlayback session has neither the
            // notifications web socket nor a chat). Only when a session is open at all.
            const hasSession = !!items.streamingManager || !!items.socketManager;

            if (mode !== ChatMode.Functional || (hasSession && !sessionSupports(mode))) {
                await disconnect();
            }

            callbacks.onModeChange?.(mode);
        }
    }

    async function changeMode(mode: ChatMode) {
        if (isStreamsV2 && isChatModeWithoutChat(mode)) {
            throw new ValidationError(UNSUPPORTED_CHAT_MODE_FOR_EXPRESSIVE);
        }

        await applyMode(mode);
    }

    return {
        agent: agentEntity,
        getStreamType: () => items.streamingManager?.streamType,
        isInterruptAvailable: () => items.streamingManager?.interruptAvailable ?? false,
        // A copy: the same array instance is held by `agent.starter_message`, and handing it out
        // made `manager.starterMessages` an alias the application could write through.
        starterMessages: [...(agentEntity.starter_message ?? [])],
        getSttToken: () => agentsApi.getSttToken(agentEntity.id),
        getChatMode: () => items.chatMode,
        getConnectionState: () => connectionState,
        getSessionInfo: () => sessionInfo,
        changeMode,
        enrichAnalytics: analytics.enrich,
        async connect() {
            // Checked again here, not only at creation: `changeMode()` can move a manager built in
            // a textual mode into one that streams video, and opening that stream with nothing to
            // render it into fails silently — a paid session with no picture.
            if (!callbacks.onSrcObjectReady && !isTextualChat(items.chatMode)) {
                throw new ValidationError(MISSING_SRC_OBJECT_READY);
            }

            if (opInFlight) {
                return opInFlight;
            }

            if (items.streamingManager) {
                throw new ValidationError('Already connected; call disconnect() first');
            }

            await runConnect(true);

            // Not tracked when a `disconnect()` overtook the attempt: nothing is connected.
            if (items.streamingManager) {
                analytics.track('agent-chat', {
                    event: 'connect',
                    mode: items.chatMode,
                });
            }
        },
        async reconnect() {
            if (opInFlight) {
                throw new ValidationError('A connect() is in flight; wait for it before calling reconnect()');
            }

            // The whole body holds the flag, teardown included, so a `disconnect()` cannot land
            // between the teardown and the new session.
            return runOp(async () => {
                const streamingManager = items.streamingManager as { reconnect?: () => Promise<void> } | undefined;
                let fallbackReason: string | undefined;

                if (isStreamsV2 && streamingManager?.reconnect) {
                    try {
                        await streamingManager.reconnect();
                    } catch (error) {
                        const analyticsError = toErrorAnalytics(error);
                        // Keep the Agents API's own classification where there is one — `kind` is
                        // the literal `'HttpError'` for every failed request since 3.0.
                        fallbackReason = analyticsError.code ?? analyticsError.kind;
                        await disconnect();
                        await connect(false);
                    }
                } else {
                    await disconnect();
                    await connect(false);
                }

                analytics.track('agent-chat', {
                    event: 'reconnect',
                    mode: items.chatMode,
                    // A mid-flight disconnect, or a server mode that tore the session down, leaves
                    // nothing connected.
                    success: !!items.streamingManager,
                    ...(fallbackReason && { fallbackReason }),
                });
            });
        },
        async disconnect() {
            // Not awaited: a connect can take minutes (three attempts, 45 s each, plus a web
            // socket with no timeout of its own), and an unmount handler must not inherit that.
            // The flag is what closes the race — the operation checks it once it has a session and
            // tears down what it built.
            if (opInFlight) {
                disconnectRequested = true;
            }

            await disconnect();

            analytics.track('agent-chat', {
                event: 'disconnect',
                mode: items.chatMode,
            });
        },
        publishMicrophoneStream(stream: MediaStream): Promise<void> {
            if (!items.streamingManager?.publishMicrophoneStream) {
                return Promise.reject(
                    new ValidationError(
                        'publishMicrophoneStream is only available on Expressive (V4) agents, after connect()'
                    )
                );
            }
            return items.streamingManager.publishMicrophoneStream(stream);
        },
        setSttLanguage(language: string): Promise<void> {
            if (!isStreamsV2 || !items.streamingManager) {
                return Promise.reject(
                    new ValidationError('setSttLanguage is only available on Expressive (V4) agents, after connect()')
                );
            }

            analytics.track('agent-stt-language-change', { language });

            return items.streamingManager.sendDataChannelMessage(
                InternalDataChannelTopic.SttLanguage,
                JSON.stringify({ language })
            );
        },
        sendDataChannelMessage(topic: `${DataChannelTopic}`, payload: Record<string, unknown>): Promise<void> {
            if (!isStreamsV2 || !items.streamingManager) {
                return Promise.reject(
                    new ValidationError(
                        'sendDataChannelMessage is only available on Expressive (V4) agents, after connect()'
                    )
                );
            }

            analytics.track('agent-data-message', { topic });

            return items.streamingManager.sendDataChannelMessage(topic, JSON.stringify(payload));
        },
        unpublishMicrophoneStream(): Promise<void> {
            if (!items.streamingManager?.unpublishMicrophoneStream) {
                return Promise.resolve();
            }
            return items.streamingManager.unpublishMicrophoneStream();
        },
        replaceMicrophoneTrack(track: MediaStreamTrack): Promise<void> {
            if (!items.streamingManager?.replaceMicrophoneTrack) {
                return Promise.reject(
                    new ValidationError(
                        'replaceMicrophoneTrack is only available on Expressive (V4) agents, after connect()'
                    )
                );
            }
            return items.streamingManager.replaceMicrophoneTrack(track);
        },
        publishCameraStream(stream: MediaStream): Promise<void> {
            if (!items.streamingManager?.publishCameraStream) {
                return Promise.reject(
                    new ValidationError(
                        'publishCameraStream is only available on Expressive (V4) agents, after connect()'
                    )
                );
            }
            return items.streamingManager.publishCameraStream(stream);
        },
        unpublishCameraStream(): Promise<void> {
            if (!items.streamingManager?.unpublishCameraStream) {
                return Promise.resolve();
            }
            return items.streamingManager.unpublishCameraStream();
        },
        async chat(userMessage: string) {
            const validateChatRequest = () => {
                if (isChatModeWithoutChat(items.chatMode)) {
                    throw new ValidationError(`${items.chatMode} is enabled, chat is disabled`);
                } else if (userMessage.length >= MAX_CHAT_MESSAGE_LENGTH) {
                    throw new ValidationError(`Message cannot be more than ${MAX_CHAT_MESSAGE_LENGTH} characters`);
                } else if (userMessage.length === 0) {
                    throw new ValidationError('Message cannot be empty');
                } else if (items.chatMode === ChatMode.Maintenance) {
                    throw new ValidationError('Chat is in maintenance mode');
                } else if (![ChatMode.TextOnly, ChatMode.Playground].includes(items.chatMode)) {
                    if (!items.streamingManager) {
                        throw new ValidationError('Streaming manager is not initialized');
                    }
                    if (!items.chat) {
                        throw new ValidationError('Chat is not initialized');
                    }
                }
            };

            const initializeChat = async () => {
                if (!items.chat) {
                    const newChat = await createChat(
                        agentEntity,
                        agentsApi,
                        analytics,
                        items.chatMode,
                        managerOptions.persistentChat
                    );

                    if (!newChat.chat) {
                        throw new ChatCreationFailed(items.chatMode, !!managerOptions.persistentChat);
                    }

                    items.chat = newChat.chat;
                    callbacks.onNewChat?.(items.chat.id);
                }

                return items.chat.id;
            };

            const sendChatRequest = async (messages: Message[], chatId: string) => {
                // For playground mode, always use v1 path
                const isPlayground = items.chatMode === ChatMode.Playground;
                const useV2Path = isStreamsV2 && !isPlayground;

                const chatRequestFn = useV2Path
                    ? async () => {
                          await items.streamingManager?.sendDataChannelMessage(
                              InternalDataChannelTopic.Chat,
                              userMessage
                          );
                          return Promise.resolve({} as ChatResponse);
                      }
                    : async () => {
                          return agentsApi.chat(
                              agentEntity.id,
                              chatId,
                              {
                                  chatMode: items.chatMode,
                                  streamId: items.streamingManager?.streamId,
                                  sessionId: items.streamingManager?.sessionId,
                                  messages: messages.map(({ matches, ...message }) => message),
                              },
                              {
                                  ...getRequestHeaders(items.chatMode),
                                  skipErrorHandler: true,
                              }
                          );
                      };

                return retryOperation(chatRequestFn, {
                    limit: 2,
                    shouldRetryFn: error => {
                        const isInvalidSessionId = error?.message?.includes('missing or invalid session_id');
                        const isStreamError = error?.message?.includes('Stream Error');

                        if (!isStreamError && !isInvalidSessionId) {
                            callbacks.onError?.(error);
                            return false;
                        }
                        return true;
                    },
                    onRetry: async () => {
                        await disconnect();
                        await runConnect(false);
                    },
                });
            };

            try {
                clearQueue();
                validateChatRequest();

                items.messages.push({
                    id: getRandom(),
                    role: 'user',
                    content: userMessage,
                    parts: parseMessagePartsMemo(userMessage),
                    createdAt: new Date(latencyTimestampTracker.update()).toISOString(),
                });

                callbacks.onNewMessage?.([...items.messages], 'user');

                const chatId = await initializeChat();
                const response = await sendChatRequest([...items.messages], chatId);

                // Skip the assistant push entirely when `response.result` is empty — streaming
                // modes deliver the actual reply through `chat/partial` + `chat/answer`, so the
                // REST endpoint commonly returns an empty string that would otherwise leave a
                // ghost assistant entry in `items.messages` (a "" bubble hidden by CSS but still
                // exported in transcripts).
                if (response.result) {
                    items.messages.push({
                        id: getRandom(),
                        role: 'assistant',
                        content: response.result,
                        parts: parseMessagePartsMemo(response.result),
                        createdAt: new Date().toISOString(),
                        context: response.context,
                        matches: response.matches,
                    });
                }

                analytics.track('agent-message-send', {
                    event: 'success',
                    messages: items.messages.length + 1,
                });

                if (response.result) {
                    callbacks.onNewMessage?.([...items.messages], 'answer');

                    analytics.track('agent-message-received', {
                        latency: latencyTimestampTracker.get(true),
                        messages: items.messages.length,
                    });
                }

                return response;
            } catch (e) {
                if (items.messages[items.messages.length - 1]?.role === 'assistant') {
                    items.messages.pop();
                }

                analytics.track('agent-message-send', {
                    event: 'error',
                    messages: items.messages.length,
                    error: toErrorAnalytics(e),
                });

                throw e;
            }
        },
        async rate(messageId: string, score: 1 | -1, rateId?: string) {
            const message = items.messages.find(message => message.id === messageId);

            if (!items.chat) {
                throw new ValidationError('Chat is not initialized');
            } else if (!message) {
                throw new ValidationError('Message not found');
            }

            const matches: [string, string][] = message.matches?.map(match => [match.document_id, match.id]) ?? [];

            analytics.track('agent-rate', {
                event: rateId ? 'update' : 'create',
                thumb: score === 1 ? 'up' : 'down',
                knowledge_id: agentEntity.knowledge?.id ?? '',
                matches,
                score,
            });

            if (rateId) {
                return agentsApi.updateRating(agentEntity.id, items.chat.id, rateId, {
                    knowledge_id: agentEntity.knowledge?.id ?? '',
                    message_id: messageId,
                    matches,
                    score,
                });
            }

            return agentsApi.createRating(agentEntity.id, items.chat.id, {
                knowledge_id: agentEntity.knowledge?.id ?? '',
                message_id: messageId,
                matches,
                score,
            });
        },
        async deleteRate(id: string) {
            if (!items.chat) {
                throw new ValidationError('Chat is not initialized');
            }

            analytics.track('agent-rate-delete', { type: 'text' });

            return agentsApi.deleteRating(agentEntity.id, items.chat.id, id);
        },
        async submitFeedback(rating: 1 | 2 | 3 | 4 | 5, answer?: string) {
            if (!items.chat) {
                throw new ValidationError('Chat is not initialized');
            }

            analytics.track('agent-feedback', { rating, hasAnswer: !!answer });

            return agentsApi.submitFeedback(agentEntity.id, items.chat.id, { rating, answer });
        },
        async speak(payload: string | SpeakScript) {
            function getScript(): StreamScript {
                if (typeof payload === 'string') {
                    return {
                        type: 'text',
                        input: payload,
                        ssml: false,
                    };
                }

                if (payload.type === 'text' && !payload.provider) {
                    return {
                        type: 'text',
                        input: payload.input,
                        ssml: payload.ssml,
                        should_queue_speaks: payload.should_queue_speaks,
                        sentiment: payload.sentiment,
                    };
                }

                return payload;
            }

            const script = getScript();
            analytics.track('agent-speak', script);
            latencyTimestampTracker.update();

            if (items.messages && script.type === 'text') {
                items.messages.push({
                    id: getRandom(),
                    role: 'assistant',
                    content: script.input,
                    parts: parseMessagePartsMemo(script.input),
                    createdAt: new Date().toISOString(),
                });
                callbacks.onNewMessage?.([...items.messages], 'answer');
            }

            const noVideoResponse = { duration: 0, videoId: '', status: 'success' };

            // A textual chat produces no video, so there is nothing to speak.
            if (isTextualChat(items.chatMode)) {
                return noVideoResponse;
            }

            if (!items.streamingManager) {
                throw new ValidationError('Please connect to the agent first');
            }

            const response = await items.streamingManager.speak({
                script,
                metadata: { chat_id: items.chat?.id, agent_id: agentEntity.id },
            });

            return response ?? noVideoResponse;
        },
        interrupt,
        registerClientTool,
        unregisterClientTool,
    };
}
