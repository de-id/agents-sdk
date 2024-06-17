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
    Message,
    StreamEvents,
    StreamingState,
    SupportedStreamScipt,
    VideoType,
} from './types/index';

import { Auth, StreamScript } from '.';
import { createAgentsApi } from './api/agents';
import { getRandom } from './auth/getAuthHeader';
import { SocketManager, createSocketManager } from './connectToSocket';
import { PLAYGROUND_HEADER } from './consts';
import { StreamingManager, createStreamingManager } from './createStreamingManager';
import { didApiUrl, didSocketApiUrl, mixpanelKey } from './environment';
import { Analytics, initializeAnalytics } from './services/mixpanel';
import { getAnaliticsInfo } from './utils/analytics';

const stitchDefaultResolution = 1080;
let messageSentTimestamp = 0;

interface AgentManagrItems {
    chat?: Chat;
    streamingManager?: StreamingManager<CreateStreamOptions>;
    socketManager?: SocketManager;
    messages: Message[];
    chatMode: ChatMode;
}

function getAgentStreamArgs(agent: Agent, options?: AgentManagerOptions): CreateStreamOptions {
    if (!agent.presenter) {
        throw new Error('Presenter is not initialized');
    } else if (agent.presenter.type === VideoType.Clip) {
        return {
            videoType: VideoType.Clip,
            driver_id: agent.presenter.driver_id,
            presenter_id: agent.presenter.presenter_id,
            stream_warmup: true,
        };
    }

    return {
        videoType: VideoType.Talk,
        source_url: agent.presenter.source_url,
        session_timeout: options?.streamOptions?.session_timeout,
        stream_warmup: options?.streamOptions?.stream_warmup ?? true,
        compatibility_mode: options?.streamOptions?.compatibility_mode,
        output_resolution: options?.outputResolution || (agent.presenter.stitch ? stitchDefaultResolution : undefined),
    };
}

function getRequestHeaders(chatMode?: ChatMode): Record<string, string> {
    return chatMode === ChatMode.Playground ? { [PLAYGROUND_HEADER]: 'true' } : {};
}

async function newChat(agentId: string, agentsApi: AgentsAPI, analytics: Analytics, chatMode?: ChatMode) {
    try {
        const newChat = await agentsApi.newChat(agentId, getRequestHeaders(chatMode));

        analytics.track('agent-chat', {
            event: 'created',
            chat_id: newChat.id,
            agent_id: agentId,
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
                callbacks: {
                    ...options.callbacks,
                    onConnectionStateChange: async state => {
                        if (state === ConnectionState.Connected) {
                            if (!chat && options.mode !== ChatMode.DirectPlayback) {
                                chat = await newChat(agent.id, agentsApi, analytics, options.mode).catch(e => {
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

function getInitialMessages(agent: Agent): Message[] {
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
    const items: AgentManagrItems = {
        messages: [],
        chatMode: options.mode || ChatMode.Functional,
    };

    let lastMessageAnswerIdx = -1;

    const baseURL = options.baseURL || didApiUrl;
    const wsURL = options.wsURL || didSocketApiUrl;
    const mxKey = options.mixpanelKey || mixpanelKey;

    const agentsApi = createAgentsApi(options.auth, baseURL, options.callbacks.onError);
    const agentInstance = await agentsApi.getById(agent);

    items.messages = getInitialMessages(agentInstance);
    options.callbacks.onNewMessage?.(items.messages, 'answer');

    const analytics = initializeAnalytics({ token: mxKey, agent: agentInstance, ...options });
    analytics.track('agent-sdk', { event: 'loaded', ...getAnaliticsInfo(agentInstance) });

    const socketManagerCallbacks: { onMessage: ChatProgressCallback } = {
        onMessage: (event, data): void => {
            if ('content' in data) {
                // Chat event
                const { content } = data;
                const lastMessage = items.messages[items.messages.length - 1];

                if (lastMessage?.role === 'assistant') {
                    if (lastMessageAnswerIdx < items.messages.length) {
                        lastMessage.content = event === ChatProgress.Partial ? lastMessage.content + content : content;
                    }

                    if (event === ChatProgress.Answer) {
                        lastMessageAnswerIdx = items.messages.length;
                        analytics.track('agent-message-received', { messages: items.messages.length });
                    }
                }

                options.callbacks.onNewMessage?.(items.messages, event === ChatProgress.Answer ? 'answer' : 'partial');
            } else {
                const SEvent = StreamEvents;
                const completedEvents = [SEvent.StreamVideoDone, SEvent.StreamVideoError, SEvent.StreamVideoRejected];
                const failedEvents = [SEvent.StreamFailed, SEvent.StreamVideoError, SEvent.StreamVideoRejected];

                event = event as StreamEvents;
                const template = (agentInstance.llm as any)?.template;

                if (event === SEvent.StreamVideoCreated) {
                    const { event, ...props } = data;

                    props.llm = { ...props.llm, template };
                    analytics.linkTrack('agent-video', { ...props }, SEvent.StreamVideoCreated, ['start']);
                } else if (completedEvents.includes(event)) {
                    // Stream video event
                    const streamEvent = event.split('/')[1];
                    const props = { ...data, event: streamEvent };

                    props.llm = { ...props.llm, template };
                    analytics.track('agent-video', { ...props, event: streamEvent });
                }

                if (failedEvents.includes(event)) {
                    options.callbacks.onError?.(new Error(`Stream failed with event ${event}`), { data });
                }

                if (data.event === SEvent.StreamDone) {
                    options.callbacks.onConnectionStateChange?.(ConnectionState.New);
                }
            }
        },
    };

    async function connect(newChat: boolean) {
        messageSentTimestamp = 0;
        lastMessageAnswerIdx = -1;

        if (newChat) {
            delete items.chat;

            items.messages = getInitialMessages(agentInstance);
            options.callbacks.onNewMessage?.(items.messages, 'answer');
        }

        const websocketPromise =
            options.mode === ChatMode.DirectPlayback
                ? Promise.resolve(undefined)
                : createSocketManager(options.auth, wsURL, socketManagerCallbacks);

        const initPromise = initializeStreamAndChat(agentInstance, options, agentsApi, analytics, items.chat).catch(
            e => {
                changeMode(ChatMode.Maintenance);
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

        changeMode(chat?.chat_mode ?? options.mode ?? ChatMode.Functional);
    }

    async function disconnect() {
        items.socketManager?.disconnect();
        await items.streamingManager?.disconnect();

        delete items.streamingManager;
        delete items.socketManager;
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

                if (!items.chat) {
                    items.chat = await newChat(agentInstance.id, agentsApi, analytics, items.chatMode);

                    options.callbacks.onNewChat?.(items.chat.id);
                }

                items.messages.push({
                    id: getRandom(),
                    role: 'user',
                    content: userMessage,
                    created_at: new Date(messageSentTimestamp).toISOString(),
                });

                options.callbacks.onNewMessage?.(items.messages, 'user');

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
                            messages,
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

                analytics.track('agent-message-send', { event: 'success', messages: items.messages.length + 1 });

                if (response.result) {
                    newMessage.content = response.result;
                    newMessage.matches = response.matches;
                    newMessage.context = response.context;

                    analytics.track('agent-message-received', {
                        latency: Date.now() - messageSentTimestamp,
                        messages: items.messages.length,
                    });

                    options.callbacks.onNewMessage?.(items.messages, 'answer');
                }

                return response;
            } catch (e) {
                if (items.messages[items.messages.length - 1].id === id) {
                    items.messages.pop();
                }

                analytics.track('agent-message-send', { event: 'error', messages: items.messages.length });

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

            analytics.track('agent-rate-delete', { type: 'text', chat_id: items.chat?.id, id });

            return agentsApi.deleteRating(agentInstance.id, items.chat.id, id);
        },
        speak(payload: string | SupportedStreamScipt) {
            if (!items.streamingManager) {
                throw new Error('Please connect to the agent first');
            }

            function getScript(): StreamScript {
                if (typeof payload === 'string') {
                    if (!agentInstance.presenter) {
                        throw new Error('Presenter is not initialized');
                    }

                    return {
                        type: 'text',
                        provider: agentInstance.presenter.voice,
                        input: payload,
                        ssml: false,
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
