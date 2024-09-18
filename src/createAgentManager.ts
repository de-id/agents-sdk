import {
    Agent,
    AgentManager,
    AgentManagerOptions,
    AgentsAPI,
    Chat,
    ChatMode,
    ChatProgress,
    ChatProgressCallback,
    ConnectionState,
    CreateStreamOptions,
    mapVideoType,
    Message,
    StreamEvents,
    StreamingState,
    SupportedStreamScipt,
} from './types/index';

import { Auth, StreamScript } from '.';
import { createAgentsApi } from './api/agents';
import { getRandom } from './auth/getAuthHeader';
import { createSocketManager, SocketManager } from './connectToSocket';
import { PLAYGROUND_HEADER } from './consts';
import { createStreamingManager, StreamingManager } from './createStreamingManager';
import { didApiUrl, didSocketApiUrl, mixpanelKey } from './environment';
import { Analytics, initializeAnalytics } from './services/mixpanel';
import { getAnaliticsInfo, getStreamAnalyticsProps } from './utils/analytics';

let messageSentTimestamp = 0;

interface AgentManagerItems {
    chat?: Chat;
    streamingManager?: StreamingManager<CreateStreamOptions>;
    socketManager?: SocketManager;
    messages: Message[];
    chatMode: ChatMode;
}

interface ChatEventQueue {
    [sequence: number]: string;
    answer?: string;
}

function getAgentStreamArgs(agent: Agent, options?: AgentManagerOptions): CreateStreamOptions {
    return {
        videoType: mapVideoType(agent.presenter.type),
        output_resolution: options?.streamOptions?.outputResolution,
        session_timeout: options?.streamOptions?.sessionTimeout,
        stream_warmup: options?.streamOptions?.streamWarmup,
        compatibility_mode: options?.streamOptions?.compatibilityMode,
    };
}

function getRequestHeaders(chatMode?: ChatMode): Record<string, Record<string, string>> {
    return chatMode === ChatMode.Playground ? { headers: { [PLAYGROUND_HEADER]: 'true' } } : {};
}

async function newChat(agentId: string, agentsApi: AgentsAPI, analytics: Analytics, chatMode?: ChatMode, persist?: boolean) {
    try {
        const newChat = await agentsApi.newChat(agentId, { persist: persist ?? false }, getRequestHeaders(chatMode));

        analytics.track('agent-chat', {
            event: 'created',
            chat_id: newChat.id,
            agent_id: agentId,
            mode: chatMode,
        });

        return newChat;
    } catch (error: any) {
        try {
            console.error(error);
            const parsedError = JSON.parse(error.message);

            if (parsedError?.kind === 'InsufficientCreditsError') {
                throw new Error('InsufficientCreditsError');
            }
        } catch (jsonError) {
            console.error('Error parsing the error message:', jsonError);
        }

        throw new Error('Cannot create new chat');
    }
}

function initializeStreamAndChat(
    agent: Agent,
    options: AgentManagerOptions,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chat?: Chat
) {
    return new Promise<{ chat?: Chat; streamingManager: StreamingManager<CreateStreamOptions> }>(
        async (resolve, reject) => {
            messageSentTimestamp = 0;

            const streamingManager = await createStreamingManager(agent.id, getAgentStreamArgs(agent, options), {
                ...options,
                analytics,
                warmup: options.streamOptions?.streamWarmup,
                callbacks: {
                    ...options.callbacks,
                    onConnectionStateChange: async state => {
                        if (state === ConnectionState.Connected) {
                            if (!chat && options.mode !== ChatMode.DirectPlayback) {
                                chat = await newChat(agent.id, agentsApi, analytics, options.mode, options.persistentChat).catch(e => {
                                    reject(e);

                                    return undefined;
                                });
                            }

                            if (streamingManager) {
                                resolve({ chat, streamingManager });
                            } else if (chat) {
                                reject(new Error('Something went wrong while initializing the manager'));
                            }
                        }

                        options.callbacks.onConnectionStateChange?.(state);
                    },
                    onVideoStateChange(state) {
                        options.callbacks.onVideoStateChange?.(state);

                        if (messageSentTimestamp > 0 && state === StreamingState.Start) {
                            analytics.linkTrack(
                                'agent-video',
                                { event: 'start', latency: Date.now() - messageSentTimestamp },
                                'start',
                                [StreamEvents.StreamVideoCreated]
                            );
                        }
                    },
                },
            }).catch(reject);
        }
    );
}

function getInitialMessages(agent: Agent, initialMessages?: Message[]): Message[] {
    if (initialMessages && initialMessages.length > 0) {
        return initialMessages;
    }
    let content: string = '';

    if (agent.greetings && agent.greetings.length > 0) {
        const randomIndex = Math.floor(Math.random() * agent.greetings.length);

        content = agent.greetings[randomIndex];
    } else {
        content = `Hi! I'm ${agent.preview_name || 'My Agent'}. How can I help you?`;
    }

    return [
        {
            content,
            id: getRandom(),
            role: 'assistant',
            created_at: new Date().toISOString(),
        },
    ];
}

function getMessageContent(chatEventQueue: ChatEventQueue) {
    if (chatEventQueue['answer'] !== undefined) {
        return chatEventQueue['answer'];
    }

    let currentSequence = 0;
    let content = '';

    while (currentSequence in chatEventQueue) {
        content += chatEventQueue[currentSequence];
        currentSequence++;
    }

    return content;
}

function processChatEvent(
    event: ChatProgress,
    data: any,
    chatEventQueue: ChatEventQueue,
    items: AgentManagerItems,
    onNewMessage: AgentManagerOptions['callbacks']['onNewMessage']
) {
    if (!(event === ChatProgress.Partial || event === ChatProgress.Answer)) {
        return;
    }

    const lastMessage = items.messages[items.messages.length - 1];

    if (lastMessage?.role !== 'assistant') {
        return;
    }

    const { content, sequence } = data;

    if (event === ChatProgress.Partial) {
        chatEventQueue[sequence] = content;
    } else {
        chatEventQueue['answer'] = content;
    }

    const messageContent = getMessageContent(chatEventQueue);

    if (lastMessage.content !== messageContent || event === ChatProgress.Answer) {
        lastMessage.content = messageContent;

        onNewMessage?.([...items.messages], event);
    }
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
    let chatEventQueue: ChatEventQueue = {};
    let firstConnection = true;

    const items: AgentManagerItems = {
        messages: [],
        chatMode: options.mode || ChatMode.Functional,
    };

    const baseURL = options.baseURL || didApiUrl;
    const wsURL = options.wsURL || didSocketApiUrl;
    const mxKey = options.mixpanelKey || mixpanelKey;

    const agentsApi = createAgentsApi(options.auth, baseURL, options.callbacks.onError);
    const agentInstance = await agentsApi.getById(agent);

    items.messages = getInitialMessages(agentInstance, options.initialMessages)
    options.callbacks.onNewMessage?.([...items.messages], 'answer');

    const analytics = initializeAnalytics({ token: mxKey, agent: agentInstance, ...options });
    analytics.track('agent-sdk', { event: 'loaded', ...getAnaliticsInfo(agentInstance) });

    const socketManagerCallbacks: { onMessage: ChatProgressCallback } = {
        onMessage: (event, data): void => {
            if ('content' in data) {
                // Chat event
                processChatEvent(event as ChatProgress, data, chatEventQueue, items, options.callbacks.onNewMessage);

                if (event === ChatProgress.Answer) {
                    analytics.track('agent-message-received', {
                        messages: items.messages.length,
                        mode: items.chatMode,
                    });
                }
            } else {
                const SEvent = StreamEvents;
                const completedEvents = [SEvent.StreamVideoDone, SEvent.StreamVideoError, SEvent.StreamVideoRejected];
                const failedEvents = [SEvent.StreamFailed, SEvent.StreamVideoError, SEvent.StreamVideoRejected];
                const props = getStreamAnalyticsProps(data, agentInstance, { mode: items.chatMode });

                event = event as StreamEvents;

                if (event === SEvent.StreamVideoCreated) {
                    analytics.linkTrack('agent-video', props, SEvent.StreamVideoCreated, ['start']);
                } else if (completedEvents.includes(event)) {
                    // Stream video event
                    const streamEvent = event.split('/')[1];
                    analytics.track('agent-video', { ...props, event: streamEvent });
                }

                if (failedEvents.includes(event)) {
                    options.callbacks.onError?.(new Error(`Stream failed with event ${event}`), { data });
                }

                if (data.event === SEvent.StreamDone) {
                    disconnect();
                }
            }
        },
    };

    async function connect(newChat: boolean) {
        options.callbacks.onConnectionStateChange?.(ConnectionState.Connecting);

        messageSentTimestamp = 0;

        if (newChat && !firstConnection) {
            delete items.chat;

            items.messages = getInitialMessages(agentInstance);
            options.callbacks.onNewMessage?.([...items.messages], 'answer');
        }

        const websocketPromise =
            options.mode === ChatMode.DirectPlayback
                ? Promise.resolve(undefined)
                : createSocketManager(options.auth, wsURL, socketManagerCallbacks);

        const initPromise = initializeStreamAndChat(agentInstance, options, agentsApi, analytics, items.chat).catch(
            e => {
                changeMode(ChatMode.Maintenance);
                options.callbacks.onConnectionStateChange?.(ConnectionState.Fail);
                throw e;
            }
        );

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
        agent: agentInstance,
        starterMessages: agentInstance.knowledge?.starter_message || [],
        changeMode,
        async connect() {
            await connect(true);

            analytics.track('agent-chat', {
                event: 'connect',
                chatId: items.chat?.id,
                agentId: agentInstance.id,
                mode: items.chatMode,
            });
        },
        async reconnect() {
            await disconnect();
            await connect(false);

            analytics.track('agent-chat', {
                event: 'reconnect',
                chatId: items.chat?.id,
                agentId: agentInstance.id,
                mode: items.chatMode,
            });
        },
        async disconnect() {
            await disconnect();

            analytics.track('agent-chat', {
                event: 'disconnect',
                chatId: items.chat?.id,
                agentId: agentInstance.id,
                mode: items.chatMode,
            });
        },
        async chat(userMessage: string) {
            const id = getRandom();

            chatEventQueue = {};

            try {
                messageSentTimestamp = Date.now();

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
                    created_at: new Date(messageSentTimestamp).toISOString(),
                });

                options.callbacks.onNewMessage?.([...items.messages], 'user');

                if (!items.chat) {
                    items.chat = await newChat(agentInstance.id, agentsApi, analytics, items.chatMode, options.persistentChat);

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

                const sendChat = (chatId: string) =>
                    agentsApi.chat(
                        agentInstance.id,
                        chatId,
                        {
                            sessionId: items.streamingManager?.sessionId,
                            streamId: items.streamingManager?.streamId,
                            chatMode: items.chatMode,
                            messages: messages.map(({ matches, ...message }) => message),
                        },
                        getRequestHeaders(items.chatMode)
                    );

                const response = await sendChat(items.chat.id).catch(async error => {
                    if (!error?.message?.includes('missing or invalid session_id')) {
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
                        latency: Date.now() - messageSentTimestamp,
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
                knowledge_id: agentInstance.knowledge?.id ?? '',
                mode: items.chatMode,
                matches,
                score,
            });

            if (rateId) {
                return agentsApi.updateRating(agentInstance.id, items.chat.id, rateId, {
                    knowledge_id: agentInstance.knowledge?.id ?? '',
                    message_id: messageId,
                    matches,
                    score,
                });
            }

            return agentsApi.createRating(agentInstance.id, items.chat.id, {
                knowledge_id: agentInstance.knowledge?.id ?? '',
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

            return agentsApi.deleteRating(agentInstance.id, items.chat.id, id);
        },
        speak(payload: string | SupportedStreamScipt) {
            if (!items.streamingManager) {
                throw new Error('Please connect to the agent first');
            }

            function getScript(): StreamScript {
                if (typeof payload === 'string') {
                    if (!agentInstance.presenter.voice) {
                        throw new Error('Presenter voice is not initialized');
                    }

                    return {
                        type: 'text',
                        provider: agentInstance.presenter.voice,
                        input: payload,
                        ssml: false,
                    };
                }

                if (payload.type === 'text' && !payload.provider) {
                    if (!agentInstance.presenter.voice) {
                        throw new Error('Presenter voice is not initialized');
                    }

                    return {
                        type: 'text',
                        provider: agentInstance.presenter.voice,
                        input: payload.input,
                        ssml: payload.ssml,
                    };
                }

                return payload;
            }

            const script = getScript();
            analytics.track('agent-speak', script);

            return items.streamingManager.speak({ script });
        },
    };
}

export function getAgent(agentId: string, auth: Auth, baseURL?: string): Promise<Agent> {
    const { getById } = createAgentsApi(auth, baseURL || didApiUrl);

    return getById(agentId);
}
