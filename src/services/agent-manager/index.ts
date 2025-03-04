import {
    Agent,
    AgentManager,
    AgentManagerOptions,
    Chat,
    ChatMode,
    ConnectionState,
    CreateStreamOptions,
    Message,
    SupportedStreamScipt,
} from '../../types/index';

import { connectionRetryTimeoutInMs } from '$/consts';
import { Auth, StreamScript } from '../..';
import { createAgentsApi } from '../../api/agents';
import { getRandom } from '../../auth/get-auth-header';
import { didApiUrl, didSocketApiUrl, mixpanelKey } from '../../environment';
import { ChatCreationFailed } from '../../errors/chat-creation-failed';
import { getAnalyticsInfo } from '../../utils/analytics';
import { retryOperation } from '../../utils/retry-operation';
import { initializeAnalytics } from '../analytics/mixpanel';
import { timestampTracker } from '../analytics/timestamp-tracker';
import { createChat, getRequestHeaders } from '../chat';
import { SocketManager, createSocketManager } from '../scoket-manager';
import { createMessageEventQueue } from '../scoket-manager/message-queue';
import { StreamingManager } from '../streaming-manager';
import { initializeStreamAndChat } from './init';
import { getInitialMessages } from './intial-messages';

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

    const mxKey = options.mixpanelKey || mixpanelKey;
    const wsURL = options.wsURL || didSocketApiUrl;
    const baseURL = options.baseURL || didApiUrl;

    const items: AgentManagerItems = { messages: [], chatMode: options.mode || ChatMode.Functional };
    const agentsApi = createAgentsApi(options.auth, baseURL, options.callbacks.onError);
    const agentEntity = await agentsApi.getById(agent);
    const analytics = initializeAnalytics({
        token: mxKey,
        agent: agentEntity,
        isEnabled: options.enableAnalitics,
        distinctId: options.distinctId,
    });
    const { onMessage, clearQueue } = createMessageEventQueue(analytics, items, options, agentEntity, () =>
        items.socketManager?.disconnect()
    );

    items.messages = getInitialMessages(agentEntity, options.initialMessages);

    options.callbacks.onNewMessage?.([...items.messages], 'answer');

    analytics.track('agent-sdk', { event: 'loaded', ...getAnalyticsInfo(agentEntity) });

    async function connect(newChat: boolean) {
        options.callbacks.onConnectionStateChange?.(ConnectionState.Connecting);

        timestampTracker.reset();

        if (newChat && !firstConnection) {
            delete items.chat;

            items.messages = getInitialMessages(agentEntity);
            options.callbacks.onNewMessage?.([...items.messages], 'answer');
        }

        const websocketPromise =
            options.mode === ChatMode.DirectPlayback
                ? Promise.resolve(undefined)
                : createSocketManager(options.auth, wsURL, { onMessage, onError: options.callbacks.onError });

        const initPromise = retryOperation(
            () => {
                return initializeStreamAndChat(
                    agentEntity,
                    options,
                    agentsApi,
                    analytics,
                    items.chat
                    // newChat ? greeting : undefined
                );
            },
            {
                limit: 3,
                timeout: connectionRetryTimeoutInMs,
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
            const id = getRandom();

            try {
                clearQueue();
                timestampTracker.update();

                if (options.mode === ChatMode.DirectPlayback) {
                    throw new Error('Direct playback is enabled, chat is disabled');
                } else if (userMessage.length >= 800) {
                    throw new Error('Message cannot be more than 800 characters');
                } else if (userMessage.length === 0) {
                    throw new Error('Message cannot be empty');
                } else if (items.chatMode === ChatMode.Maintenance) {
                    throw new Error('Chat is in maintenance mode');
                } else if (![ChatMode.TextOnly, ChatMode.Playground].includes(items.chatMode)) {
                    if (!items.streamingManager) {
                        throw new Error('Streaming manager is not initialized');
                    } else if (!items.chat) {
                        throw new Error('Chat is not initialized');
                    }
                }

                items.messages.push({
                    id: getRandom(),
                    role: 'user',
                    content: userMessage,
                    created_at: new Date(timestampTracker.get()).toISOString(),
                });

                options.callbacks.onNewMessage?.([...items.messages], 'user');

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

                const newMessage: Message = {
                    id,
                    role: 'assistant',
                    content: '',
                    created_at: new Date().toISOString(),
                    matches: [],
                };

                const messages = [...items.messages];
                items.messages.push(newMessage);

                const sendChat = (chatId: string) => {
                    return agentsApi.chat(
                        agentEntity.id,
                        chatId,
                        {
                            sessionId: items.streamingManager?.sessionId,
                            streamId: items.streamingManager?.streamId,
                            chatMode: items.chatMode,
                            messages: messages.map(({ matches, ...message }) => message),
                        },
                        {
                            ...getRequestHeaders(items.chatMode),
                            skipErrorHandler: true,
                        }
                    );
                };

                const response = await sendChat(items.chat.id).catch(async error => {
                    const isInvalidSessionId = error?.message?.includes('missing or invalid session_id');
                    const isStreamError = error?.message?.includes('Stream Error');

                    if (!isStreamError && !isInvalidSessionId) {
                        options.callbacks.onError?.(error);
                        throw error;
                    }

                    await disconnect();
                    await connect(false);

                    return sendChat(items.chat!.id);
                });

                analytics.track('agent-message-send', {
                    event: 'success',
                    mode: items.chatMode,
                    messages: items.messages.length + 1,
                });

                newMessage.context = response.context;
                newMessage.matches = response.matches;

                if (response.result) {
                    newMessage.content = response.result;

                    analytics.track('agent-message-received', {
                        latency: timestampTracker.get(true),
                        mode: items.chatMode,
                        messages: items.messages.length,
                    });

                    options.callbacks.onNewMessage?.([...items.messages], 'answer');
                }

                return response;
            } catch (e) {
                if (items.messages[items.messages.length - 1].id === id) {
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
        speak(payload: string | SupportedStreamScipt) {
            if (!items.streamingManager) {
                throw new Error('Please connect to the agent first');
            }

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
            timestampTracker.update();

            return items.streamingManager.speak({ script });
        },
    };
}

export function getAgent(agentId: string, auth: Auth, baseURL?: string): Promise<Agent> {
    const { getById } = createAgentsApi(auth, baseURL || didApiUrl);

    return getById(agentId);
}
