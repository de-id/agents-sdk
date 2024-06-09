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

function getAgentStreamArgs(agent: Agent, userOutputResolution?: number): CreateStreamOptions {
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

    const output_resolution = userOutputResolution || (agent.presenter.stitch ? stitchDefaultResolution : undefined);

    return {
        videoType: VideoType.Talk,
        source_url: agent.presenter.source_url,
        stream_warmup: true,
        ...(output_resolution && { output_resolution }),
    };
}

function initializeStreamAndChat(
    agent: Agent,
    options: AgentManagerOptions,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chat?: Chat
) {
    messageSentTimestamp = 0;
    return new Promise<{ chat: Chat; streamingManager: StreamingManager<CreateStreamOptions> }>(
        async (resolve, reject) => {
            let newChat = chat;

            const streamingManager = await createStreamingManager(
                agent.id,
                getAgentStreamArgs(agent, options.outputResolution),
                {
                    ...options,
                    analytics,
                    callbacks: {
                        ...options.callbacks,
                        onConnectionStateChange: async state => {
                            if (state === ConnectionState.Connected) {
                                if (!newChat) {
                                    try {
                                        newChat = await agentsApi.newChat(agent.id);
                                        analytics.track('agent-chat', {
                                            event: 'created',
                                            chat_id: newChat.id,
                                            agent_id: agent.id,
                                        });

                                        if (streamingManager) {
                                            resolve({ chat: newChat, streamingManager });
                                        }
                                    } catch (error: any) {
                                        console.error(error);
                                        let parsedError;
                                        try {
                                            parsedError = JSON.parse(error.message);
                                        } catch (jsonError) {
                                            console.error('Error parsing the error message:', jsonError);
                                        }
                                        if (parsedError?.kind === 'InsufficientCreditsError') {
                                            reject('InsufficientCreditsError');
                                        }
                                        reject('Cannot create new chat');
                                    }
                                }

                                if (streamingManager && newChat) {
                                    resolve({ chat: newChat, streamingManager });
                                }
                            } else if (state === ConnectionState.Fail) {
                                reject(new Error('Cannot create connection'));
                            }

                            options.callbacks.onConnectionStateChange?.(state);
                        },
                        onVideoStateChange(state) {
                            options.callbacks.onVideoStateChange?.(state);
                            if (messageSentTimestamp > 0) {
                                if (state === StreamingState.Start) {
                                    const event = 'start';
                                    analytics.linkTrack(
                                        'agent-video',
                                        { event, latency: Date.now() - messageSentTimestamp },
                                        event,
                                        [StreamEvents.StreamVideoCreated]
                                    );
                                }
                            }
                        },
                    },
                }
            ).catch(reject);
        }
    );
}

export function getAgent(agentId: string, auth: Auth, baseURL?: string): Promise<Agent> {
    const url = baseURL || didApiUrl;
    const agentsApi = createAgentsApi(auth, url);

    return agentsApi.getById(agentId);
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

    const wsURL = options.wsURL || didSocketApiUrl;
    const baseURL = options.baseURL || didApiUrl;
    const mxKey = options.mixpanelKey || mixpanelKey;

    const agentsApi = createAgentsApi(options.auth, baseURL, options.callbacks.onError);
    const agentInstance = await agentsApi.getById(agent);

    items.messages = getInitialMessages(agentInstance);
    options.callbacks.onNewMessage?.(items.messages);

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
                    }
                }

                if (event === ChatProgress.Answer) {
                    analytics.track('agent-message-received', { messages: items.messages.length });
                }

                options.callbacks.onNewMessage?.(items.messages);
            } else {
                event = event as StreamEvents;
                if (event === StreamEvents.StreamVideoCreated) {
                    const { event, ...props } = data;
                    props.llm = { ...props.llm, template: (agentInstance.llm as any)?.template };
                    analytics.linkTrack('agent-video', { ...props }, StreamEvents.StreamVideoCreated, ['start']);
                } else if (
                    [
                        StreamEvents.StreamVideoDone,
                        StreamEvents.StreamVideoError,
                        StreamEvents.StreamVideoRejected,
                    ].includes(event)
                ) {
                    // Stream video event
                    const streamEvent = event.split('/')[1];
                    const props = { ...data, event: streamEvent };
                    props.llm = { ...props.llm, template: (agentInstance.llm as any)?.template };
                    analytics.track('agent-video', { ...props, event: streamEvent });
                }
                if (
                    [
                        StreamEvents.StreamFailed,
                        StreamEvents.StreamVideoError,
                        StreamEvents.StreamVideoRejected,
                    ].includes(event)
                ) {
                    options.callbacks.onError?.(new Error(`Stream failed with event ${event}`), { data });
                }
            }
        },
    };

    async function connect() {
        messageSentTimestamp = 0;
        const socketManager = await createSocketManager(options.auth, wsURL, socketManagerCallbacks);
        const { streamingManager, chat } = await connectStreamAndChat();

        lastMessageAnswerIdx = -1;
        if (items.messages.length === 0) {
            items.messages = getInitialMessages(agentInstance);
            options.callbacks.onNewMessage?.(items.messages);
        }

        if (chat?.id && chat.id !== items.chat?.id) {
            options.callbacks.onNewChat?.(chat?.id);
        }

        items.streamingManager = streamingManager;
        items.socketManager = socketManager;
        items.chat = chat;

        const chatMode = items.chat?.chatMode || ChatMode.Functional;
        changeMode(chatMode);

        analytics.track('agent-chat', { event: 'connect', chatId: chat.id, agentId: agentInstance.id });
    }

    async function disconnect() {
        items.socketManager?.disconnect();
        await items.streamingManager?.disconnect();

        delete items.streamingManager;
        delete items.socketManager;

        items.messages = getInitialMessages(agentInstance);
        options.callbacks.onNewMessage?.(items.messages);

        analytics.track('agent-chat', { event: 'disconnect', chatId: items.chat?.id, agentId: agentInstance.id });
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

    async function reconnectStream() {
        if (!items.chat) {
            return connect();
        }

        const { streamingManager, chat } = await connectStreamAndChat();

        items.streamingManager = streamingManager;
        changeMode(items.chat.chatMode || ChatMode.Functional);
        analytics.track('agent-chat', { event: 'reconnect', chatId: chat.id, agentId: agentInstance.id });
    }

    async function connectStreamAndChat() {
        let streamingManager, chat;
        try {
            const result = await initializeStreamAndChat(agentInstance, options, agentsApi, analytics, items.chat);
            streamingManager = result.streamingManager;
            chat = result.chat;
        } catch (error) {
            changeMode(ChatMode.Maintenance);
            throw error;
        }
        return { streamingManager, chat };
    }

    return {
        agent: agentInstance,
        starterMessages: agentInstance.knowledge?.starter_message || [],
        connect,
        disconnect,
        changeMode,
        async reconnect() {
            if (!items.chat) {
                return connect();
            }

            items.socketManager?.disconnect();
            await items.streamingManager?.disconnect();

            const socketManager = await createSocketManager(options.auth, wsURL, socketManagerCallbacks);
            const { streamingManager, chat } = await connectStreamAndChat();
            items.streamingManager = streamingManager;
            items.socketManager = socketManager;

            const chatMode = items.chat.chatMode || ChatMode.Functional;
            changeMode(chatMode);

            analytics.track('agent-chat', { event: 'reconnect', chatId: chat.id, agentId: agentInstance.id });
        },
        async chat(userMessage: string) {
            const id = getRandom();

            try {
                messageSentTimestamp = Date.now();

                if (userMessage.length >= 800) {
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

                options.callbacks.onNewMessage?.(items.messages);

                if (!items.chat) {
                    items.chat = await agentsApi.newChat(agentInstance.id);
                }

                const newMessage: Message = {
                    id,
                    role: 'assistant',
                    content: '',
                    created_at: new Date().toISOString(),
                    matches: [],
                };

                items.messages.push(newMessage);
                const lastMessage = items.messages.slice(0, -1);
                let response;

                try {
                    response = await agentsApi.chat(agentInstance.id, items.chat.id, {
                        sessionId: items.streamingManager?.sessionId,
                        streamId: items.streamingManager?.streamId,
                        messages: lastMessage,
                        chatMode: items.chatMode,
                    });
                } catch (error: any) {
                    if (error?.message?.includes('missing or invalid session_id')) {
                        console.log('Invalid stream, try reconnect with new stream id');

                        await reconnectStream();

                        response = await agentsApi.chat(agentInstance.id, items.chat.id, {
                            sessionId: items.streamingManager?.sessionId,
                            streamId: items.streamingManager?.streamId,
                            messages: lastMessage,
                            chatMode: items.chatMode,
                        });
                    } else {
                        throw error;
                    }
                }

                analytics.track('agent-message-send', { event: 'success', messages: items.messages.length + 1 });
                newMessage.context = response.context;

                if (response.result) {
                    newMessage.content = response.result;
                    newMessage.matches = response.matches;

                    analytics.track('agent-message-received', {
                        latency: Date.now() - messageSentTimestamp,
                        messages: items.messages.length,
                    });

                    options.callbacks.onNewMessage?.(items.messages);
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
        getChatmode() {
            if (!items.chat) {
                throw new Error('Chat is not initialized');
            }

            return agentsApi.getChatMode(agentInstance.id, items.chat.id);
        },
        deleteRate(id: string) {
            if (!items.chat) {
                throw new Error('Chat is not initialized');
            }

            analytics.track('agent-rate-delete', { type: 'text', chat_id: items.chat?.id, id });

            return agentsApi.deleteRating(agentInstance.id, items.chat.id, id);
        },
        speak(payload: SupportedStreamScipt) {
            if (!items.streamingManager) {
                throw new Error('Streaming manager is not initialized');
            }

            function getScript(): StreamScript {
                if (!agentInstance.presenter) {
                    throw new Error('Presenter is not initialized');
                } else if (payload.type === 'text') {
                    const voiceProvider = payload.provider ? payload.provider : agentInstance.presenter.voice;

                    return {
                        type: 'text',
                        provider: voiceProvider,
                        input: payload.input,
                        ssml: payload.ssml || false,
                    };
                } else if (payload.type === 'audio') {
                    return { type: 'audio', audio_url: payload.audio_url };
                }

                throw new Error('Invalid payload');
            }

            const script = getScript();
            analytics.track('agent-speak', script);

            return items.streamingManager.speak({ script });
        },
    };
}
