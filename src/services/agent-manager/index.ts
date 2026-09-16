import { InternalDataChannelTopic } from '@sdk/types/stream/data-channel';
import {
    AgentManager,
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

/**
 * Creates an {@link AgentManager} for one agent: its chat, its video stream and its connections.
 *
 * Fetches the agent from the Agents API before it resolves, so the returned manager already has
 * {@link AgentManager.agent | agent} and {@link AgentManager.starterMessages | starterMessages}
 * filled in. No stream is opened until {@link AgentManager.connect | connect()} is called.
 * {@link AgentManagerOptions.callbacks | callbacks} must include
 * {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady}, which is what attaches the
 * streamed media to a video element.
 *
 * One option is checked here: an Expressive (V4) agent asked for {@link ChatMode.Off} or
 * {@link ChatMode.DirectPlayback}, which only Talks (V2) and Clips (V3) agents support, rejects
 * with a {@link ValidationError}. Every other bad argument surfaces later, as a
 * {@link ValidationError} rejected by the method that was called on the returned manager, such as
 * {@link AgentManager.chat | chat()} or {@link AgentManager.speak | speak()}.
 *
 * @param agent - Id of the agent to talk to: the `data-agent-id` from its Embed snippet, or the `id`
 * returned by the Agents API.
 * @param options - Credentials, callbacks and everything else the manager needs. See
 * {@link AgentManagerOptions}.
 * @returns A manager for that agent, ready to {@link AgentManager.connect | connect()}.
 * @throws {@link ValidationError} When an Expressive (V4) agent is created with
 * {@link ChatMode.Off} or {@link ChatMode.DirectPlayback}.
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
 *         // Required: hand the streamed media to your video element.
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
    // The caller's object is copied, never written to: two managers built from one options object
    // must not wrap each other's `callbacks.onError`.
    const managerOptions: AgentManagerOptions = { ...options, callbacks: { ...options.callbacks } };

    let firstConnection = true;

    const mxKey = managerOptions.mixpanelKey || mixpanelKey;
    const wsURL = managerOptions.wsURL || didSocketApiUrl;
    const baseURL = managerOptions.baseURL || didApiUrl;
    const mode = managerOptions.mode || ChatMode.Functional;

    const items: AgentManagerItems = {
        messages: [],
        chatMode: mode,
    };
    const analytics = initializeAnalytics({
        token: mxKey,
        agentId: agent,
        isEnabled: managerOptions.enableAnalytics,
        externalId: managerOptions.externalId,
        mixpanelAdditionalProperties: managerOptions.mixpanelAdditionalProperties,
    });

    const initTimestamp = Date.now();
    defer(() => {
        analytics.track('agent-sdk', { event: 'init' }, initTimestamp);
    });

    const originalOnError = managerOptions.callbacks.onError;
    managerOptions.callbacks.onError = (error: Error, errorData?: ErrorContext) => {
        analytics.track('agent-error', { error: toErrorAnalytics(error) });
        originalOnError?.(error, errorData);
    };

    // The state the getters answer from. Both are recorded by wrapping the callback that reports
    // them, so every path that can report one — this module, the streaming managers, the retry in
    // `connect()` — keeps them in step without a second source of truth.
    let connectionState: ConnectionState = ConnectionState.New;
    let sessionInfo: StreamCreatedInfo | undefined;

    const originalOnConnectionStateChange = managerOptions.callbacks.onConnectionStateChange;
    // Forwarded with the arguments it was called with, not with a fixed pair: a handler that reads
    // `arguments.length` — or a test that asserts on the call — must see what the SDK reported.
    managerOptions.callbacks.onConnectionStateChange = (...args: [ConnectionState, (string | undefined)?]) => {
        connectionState = args[0];
        originalOnConnectionStateChange?.(...args);
    };

    const originalOnStreamCreated = managerOptions.callbacks.onStreamCreated;
    managerOptions.callbacks.onStreamCreated = (stream: StreamCreatedInfo) => {
        sessionInfo = stream;
        originalOnStreamCreated?.(stream);
    };

    const agentsApi = createAgentsApi(
        managerOptions.auth,
        baseURL,
        managerOptions.callbacks.onError,
        managerOptions.externalId
    );

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
        managerOptions.callbacks.onConnectionStateChange?.(ConnectionState.Disconnected, reason);
    });

    items.messages = getInitialMessages(managerOptions.initialMessages);

    managerOptions.callbacks.onNewMessage?.([...items.messages], 'answer');

    const updateVideoId = (videoId: string | null) => analytics.enrich({ videoId });

    const interrupt = ({ type }: InterruptOptions) => {
        const streamingManager = items.streamingManager;
        if (!streamingManager?.interruptAvailable || !streamingManager.isInterruptible) {
            return;
        }

        const sent = streamingManager.interrupt(type);
        if (!sent) {
            return;
        }

        analytics.track('agent-video-interrupt', {
            type: type || 'click',
            video_duration_to_interrupt: interruptTimestampTracker.get(true),
            message_duration_to_interrupt: latencyTimestampTracker.get(true),
        });

        // Only flag the message once the interrupt was actually sent.
        const lastMessage = items.messages[items.messages.length - 1];
        if (!lastMessage) {
            return;
        }

        lastMessage.interrupted = true;
        managerOptions.callbacks.onNewMessage?.([...items.messages], 'answer');
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

    // One `connect()` at a time: a second run would overwrite `items.streamingManager` and leave
    // the first session open on the server. Every path that opens a session goes through
    // `runConnect`, so a racing caller joins the attempt already running.
    let connectInFlight: Promise<void> | undefined;

    function runConnect(newChat: boolean): Promise<void> {
        if (connectInFlight) {
            return connectInFlight;
        }

        connectInFlight = connect(newChat).finally(() => {
            connectInFlight = undefined;
        });

        return connectInFlight;
    }

    async function connect(newChat: boolean) {
        rotateConnectionId();
        managerOptions.callbacks.onConnectionStateChange?.(ConnectionState.Connecting);

        latencyTimestampTracker.reset();

        if (newChat && !firstConnection) {
            delete items.chat;

            managerOptions.callbacks.onNewMessage?.([...items.messages], 'answer');
        }

        const websocketPromise = sessionNeedsSocket(items.chatMode)
            ? createSocketManager(
                  managerOptions.auth,
                  wsURL,
                  { onMessage, onError: managerOptions.callbacks.onError },
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
                            ...managerOptions.callbacks,
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
            applyMode(ChatMode.Maintenance);
            managerOptions.callbacks.onConnectionStateChange?.(ConnectionState.Fail);
            throw e;
        });

        const [socketManager, { streamingManager, chat }] = await Promise.all([websocketPromise, initPromise]);

        if (chat && chat.id !== items.chat?.id) {
            managerOptions.callbacks.onNewChat?.(chat.id);
        }

        items.streamingManager = streamingManager;
        items.socketManager = socketManager;
        items.chat = chat;

        flushClientToolsToRoom();

        firstConnection = false;

        analytics.enrich({
            chatId: chat?.id,
            streamId: streamingManager?.streamId,
            mode: items.chatMode,
        });

        const serverMode = chat?.chat_mode ?? items.chatMode;
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

        managerOptions.callbacks.onConnectionStateChange?.(ConnectionState.Disconnected);
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
            // open session cannot carry a conversation: a DirectPlayback session has neither the
            // notifications web socket nor a chat, so `chat()` would never be answered.
            if (mode !== ChatMode.Functional || !sessionSupports(mode)) {
                await disconnect();
            }

            managerOptions.callbacks.onModeChange?.(mode);
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
        starterMessages: agentEntity.starter_message || [],
        getSttToken: () => agentsApi.getSttToken(agentEntity.id),
        getChatMode: () => items.chatMode,
        getConnectionState: () => connectionState,
        getSessionInfo: () => sessionInfo,
        changeMode,
        enrichAnalytics: analytics.enrich,
        async connect() {
            if (connectInFlight) {
                return connectInFlight;
            }

            if (items.streamingManager) {
                throw new ValidationError('Already connected; call disconnect() first');
            }

            await runConnect(true);

            analytics.track('agent-chat', {
                event: 'connect',
                mode: items.chatMode,
            });
        },
        async reconnect() {
            if (connectInFlight) {
                throw new ValidationError('A connect() is in flight; wait for it before calling reconnect()');
            }

            const streamingManager = items.streamingManager as { reconnect?: () => Promise<void> } | undefined;
            let fallbackReason: string | undefined;

            if (isStreamsV2 && streamingManager?.reconnect) {
                try {
                    await streamingManager.reconnect();
                } catch (error) {
                    const analyticsError = toErrorAnalytics(error);
                    // Keep the Agents API's own classification where there is one — `kind` is the
                    // literal `'HttpError'` for every failed request since 3.0.
                    fallbackReason = analyticsError.code ?? analyticsError.kind;
                    await disconnect();
                    await runConnect(false);
                }
            } else {
                await disconnect();
                await runConnect(false);
            }

            analytics.track('agent-chat', {
                event: 'reconnect',
                mode: items.chatMode,
                success: true,
                ...(fallbackReason && { fallbackReason }),
            });
        },
        async disconnect() {
            // Let an in-flight connect settle first, so its assignment of `items.streamingManager`
            // cannot land after this call cleared it and leave a session running on the server.
            await connectInFlight?.catch(() => {});
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
                    managerOptions.callbacks.onNewChat?.(items.chat.id);
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
                            managerOptions.callbacks.onError?.(error);
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

                managerOptions.callbacks.onNewMessage?.([...items.messages], 'user');

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
                    managerOptions.callbacks.onNewMessage?.([...items.messages], 'answer');

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
        async submitFeedback(rating: number, answer?: string) {
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
                managerOptions.callbacks.onNewMessage?.([...items.messages], 'answer');
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
