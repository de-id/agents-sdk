import {
    Agent,
    AgentManager,
    AgentManagerOptions,
    Auth,
    Chat,
    ChatMode,
    ChatProgress,
    ConnectionState,
    CreateStreamOptions,
    Interrupt,
    Message,
    StreamEvents,
    StreamScript,
    SupportedStreamScript,
} from '../../types';

import { CONNECTION_RETRY_TIMEOUT_MS } from '$/config/consts';
import { didApiUrl, didSocketApiUrl, mixpanelKey } from '$/config/environment';
import { ChatCreationFailed, ValidationError } from '$/errors';
import { getRandom } from '$/utils';
import { isTextualChat } from '$/utils/chat';
import { createAgentsApi } from '../../api/agents';
import { getAgentInfo, getAnalyticsInfo } from '../../utils/analytics';
import { retryOperation } from '../../utils/retry-operation';
import { initializeAnalytics } from '../analytics/mixpanel';
import { interruptTimestampTracker, latencyTimestampTracker } from '../analytics/timestamp-tracker';
import { createChat, getRequestHeaders } from '../chat';
import { getInitialMessages } from '../chat/intial-messages';
import { sendInterrupt, validateInterrupt } from '../interrupt';
import { SocketManager, createSocketManager } from '../socket-manager';
import { createMessageEventQueue } from '../socket-manager/message-queue';
import { StreamingManager } from '../streaming-manager';
import { initializeStreamAndChat } from './connect-to-manager';

export interface AgentManagerItems {
    chat?: Chat;
    streamingManager?: StreamingManager<CreateStreamOptions>;
    socketManager?: SocketManager;
    messages: Message[];
    chatMode: ChatMode;
}

/**
 * Creates a new Agent Manager instance for interacting with an agent, chat, and related connections.
 *
 * @param {string} agent - The ID or instance of the agent to chat with.
 * @param {AgentManagerOptions} options - Configurations for the Agent Manager API.
 * * @returns {Promise<AgentManager>} - A promise that resolves to an instance of the AgentsAPI interface.
 *
 * @throws {Error} Throws an error if the agent is not initialized.
 *
 * @example
 * const agentManager = await createAgentManager('id-agent123', { auth: { type: 'key', clientKey: '123', externalId: '123' } });
 */
export async function createAgentManager(agent: string, options: AgentManagerOptions): Promise<AgentManager> {
    let firstConnection = true;
    let videoId: string | null = null;

    const mxKey = options.mixpanelKey || mixpanelKey;
    const wsURL = options.wsURL || didSocketApiUrl;
    const baseURL = options.baseURL || didApiUrl;

    const items: AgentManagerItems = {
        messages: [],
        chatMode: options.mode || ChatMode.Functional,
    };
    const analytics = initializeAnalytics({
        token: mxKey,
        agentId: agent,
        isEnabled: options.enableAnalitics,
        distinctId: options.distinctId,
    });

    const updateVideoId = (event: StreamEvents | ChatProgress, data: any) => {
        if (event === StreamEvents.StreamVideoCreated) {
            videoId = data.videoId;
        }

        if (event === StreamEvents.StreamVideoDone) {
            videoId = null;
        }
    };

    analytics.track('agent-sdk', { event: 'init' });
    const agentsApi = createAgentsApi(options.auth, baseURL, options.callbacks.onError);

    const agentEntity = await agentsApi.getById(agent);
    analytics.enrich(getAgentInfo(agentEntity));

    const { onMessage, clearQueue } = createMessageEventQueue(
        analytics,
        items,
        options,
        agentEntity,
        () => items.socketManager?.disconnect(),
        (event, data) => updateVideoId(event, data)
    );

    items.messages = getInitialMessages(options.initialMessages);

    options.callbacks.onNewMessage?.([...items.messages], 'answer');

    analytics.track('agent-sdk', { event: 'loaded', ...getAnalyticsInfo(agentEntity) });

    async function connect(newChat: boolean) {
        options.callbacks.onConnectionStateChange?.(ConnectionState.Connecting);

        latencyTimestampTracker.reset();

        if (newChat && !firstConnection) {
            delete items.chat;

            options.callbacks.onNewMessage?.([...items.messages], 'answer');
        }

        const websocketPromise =
            options.mode === ChatMode.DirectPlayback
                ? Promise.resolve(undefined)
                : createSocketManager(options.auth, wsURL, { onMessage, onError: options.callbacks.onError });

        const initPromise = retryOperation(
            () => {
                return initializeStreamAndChat(agentEntity, options, agentsApi, analytics, items.chat);
            },
            {
                limit: 3,
                timeout: CONNECTION_RETRY_TIMEOUT_MS,
                timeoutErrorMessage: 'Timeout initializing the stream',
                // Retry on all errors except for connection errors and rate limit errors, these are already handled in client level.
                shouldRetryFn: (error: any) => error?.message !== 'Could not connect' && error.status !== 429,
                delayMs: 1000,
            }
        ).catch(e => {
            changeMode(ChatMode.Maintenance);
            options.callbacks.onConnectionStateChange?.(ConnectionState.Fail);
            throw e;
        });

        const [socketManager, { streamingManager, chat }] = await Promise.all([websocketPromise, initPromise]);

        if (chat && chat.id !== items.chat?.id) {
            options.callbacks.onNewChat?.(chat.id);
        }

        items.streamingManager = streamingManager;
        items.socketManager = socketManager;
        items.chat = chat;

        firstConnection = false;

        changeMode(chat?.chat_mode ?? options.mode ?? ChatMode.Functional);
    }

    async function disconnect() {
        items.socketManager?.disconnect();
        await items.streamingManager?.disconnect();

        delete items.streamingManager;
        delete items.socketManager;

        options.callbacks.onConnectionStateChange?.(ConnectionState.Disconnected);
    }

    async function changeMode(mode: ChatMode) {
        if (mode !== items.chatMode) {
            analytics.track('agent-mode-change', { mode });
            items.chatMode = mode;

            if (items.chatMode !== ChatMode.Functional) {
                await disconnect();
            }

            options.callbacks.onModeChange?.(mode);
        }
    }

    return {
        agent: agentEntity,
        getStreamType: () => items.streamingManager?.streamType,
        getIsInterruptAvailable: () => items.streamingManager?.interruptAvailable ?? false,
        starterMessages: agentEntity.knowledge?.starter_message || [],
        getSTTToken: () => agentsApi.getSTTToken(agentEntity.id),
        changeMode,
        enrichAnalytics: analytics.enrich,
        async connect() {
            await connect(true);

            analytics.track('agent-chat', {
                event: 'connect',
                chatId: items.chat?.id,
                agentId: agentEntity.id,
                mode: items.chatMode,
            });
        },
        async reconnect() {
            await disconnect();
            await connect(false);

            analytics.track('agent-chat', {
                event: 'reconnect',
                chatId: items.chat?.id,
                agentId: agentEntity.id,
                mode: items.chatMode,
            });
        },
        async disconnect() {
            await disconnect();

            analytics.track('agent-chat', {
                event: 'disconnect',
                chatId: items.chat?.id,
                agentId: agentEntity.id,
                mode: items.chatMode,
            });
        },
        async chat(userMessage: string) {
            const validateChatRequest = () => {
                if (options.mode === ChatMode.DirectPlayback) {
                    throw new ValidationError('Direct playback is enabled, chat is disabled');
                } else if (userMessage.length >= 800) {
                    throw new ValidationError('Message cannot be more than 800 characters');
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
                        options.persistentChat
                    );

                    if (!newChat.chat) {
                        throw new ChatCreationFailed(items.chatMode, !!options.persistentChat);
                    }

                    items.chat = newChat.chat;
                    options.callbacks.onNewChat?.(items.chat.id);
                }

                return items.chat.id;
            };

            const sendChatRequest = async (messages: Message[], chatId: string) => {
                return retryOperation(
                    () => {
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
                    },
                    {
                        limit: 2,
                        shouldRetryFn: error => {
                            const isInvalidSessionId = error?.message?.includes('missing or invalid session_id');
                            const isStreamError = error?.message?.includes('Stream Error');

                            if (!isStreamError && !isInvalidSessionId) {
                                options.callbacks.onError?.(error);
                                return false;
                            }
                            return true;
                        },
                        onRetry: async () => {
                            await disconnect();
                            await connect(false);
                        },
                    }
                );
            };

            try {
                clearQueue();
                validateChatRequest();

                items.messages.push({
                    id: getRandom(),
                    role: 'user',
                    content: userMessage,
                    created_at: new Date(latencyTimestampTracker.update()).toISOString(),
                });

                options.callbacks.onNewMessage?.([...items.messages], 'user');

                const chatId = await initializeChat();
                const response = await sendChatRequest([...items.messages], chatId);

                items.messages.push({
                    id: getRandom(),
                    role: 'assistant',
                    content: response.result || '',
                    created_at: new Date().toISOString(),
                    context: response.context,
                    matches: response.matches,
                });

                analytics.track('agent-message-send', {
                    event: 'success',
                    mode: items.chatMode,
                    messages: items.messages.length + 1,
                });

                if (response.result) {
                    options.callbacks.onNewMessage?.([...items.messages], 'answer');

                    analytics.track('agent-message-received', {
                        latency: latencyTimestampTracker.get(true),
                        mode: items.chatMode,
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
                    mode: items.chatMode,
                    messages: items.messages.length,
                });

                throw e;
            }
        },
        rate(messageId: string, score: 1 | -1, rateId?: string) {
            const message = items.messages.find(message => message.id === messageId);

            if (!items.chat) {
                throw new Error('Chat is not initialized');
            } else if (!message) {
                throw new Error('Message not found');
            }

            const matches: [string, string][] = message.matches?.map(match => [match.document_id, match.id]) ?? [];

            analytics.track('agent-rate', {
                event: rateId ? 'update' : 'create',
                thumb: score === 1 ? 'up' : 'down',
                knowledge_id: agentEntity.knowledge?.id ?? '',
                mode: items.chatMode,
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
        deleteRate(id: string) {
            if (!items.chat) {
                throw new Error('Chat is not initialized');
            }

            analytics.track('agent-rate-delete', { type: 'text', chat_id: items.chat?.id, id, mode: items.chatMode });

            return agentsApi.deleteRating(agentEntity.id, items.chat.id, id);
        },
        async speak(payload: string | SupportedStreamScript) {
            function getScript(): StreamScript {
                if (typeof payload === 'string') {
                    if (!agentEntity.presenter.voice) {
                        throw new Error('Presenter voice is not initialized');
                    }

                    return {
                        type: 'text',
                        provider: agentEntity.presenter.voice,
                        input: payload,
                        ssml: false,
                    };
                }

                if (payload.type === 'text' && !payload.provider) {
                    if (!agentEntity.presenter.voice) {
                        throw new Error('Presenter voice is not initialized');
                    }

                    return {
                        type: 'text',
                        provider: agentEntity.presenter.voice,
                        input: payload.input,
                        ssml: payload.ssml,
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
                    created_at: new Date(latencyTimestampTracker.get(true)).toISOString(),
                });
                options.callbacks.onNewMessage?.([...items.messages], 'answer');
            }

            const isTextual = isTextualChat(items.chatMode);

            // If the current chat is textual, we shouldn't activate the TTS.
            if (isTextual) {
                return {
                    duration: 0,
                    video_id: '',
                    status: 'success',
                };
            }

            if (!items.streamingManager) {
                throw new Error('Please connect to the agent first');
            }

            return items.streamingManager.speak({
                script,
                metadata: { chat_id: items.chat?.id, agent_id: agentEntity.id },
            });
        },
        async interrupt({ type }: Interrupt) {
            validateInterrupt(items.streamingManager, items.streamingManager?.streamType, videoId);
            const lastMessage = items.messages[items.messages.length - 1];

            analytics.track('agent-video-interrupt', {
                type: type || 'click',
                stream_id: items.streamingManager?.streamId,
                agent_id: agentEntity.id,
                owner_id: agentEntity.owner_id,
                video_duration_to_interrupt: interruptTimestampTracker.get(true),
                message_duration_to_interrupt: latencyTimestampTracker.get(true),
                chat_id: items.chat?.id,
                mode: items.chatMode,
            });

            lastMessage.interrupted = true;
            options.callbacks.onNewMessage?.([...items.messages], 'answer');
            sendInterrupt(items.streamingManager!, videoId!);
        },
    };
}

export function getAgent(agentId: string, auth: Auth, baseURL?: string): Promise<Agent> {
    const { getById } = createAgentsApi(auth, baseURL || didApiUrl);

    return getById(agentId);
}
