import {
    Agent,
    AgentManager,
    AgentManagerOptions,
    AgentsAPI,
    Chat,
    CreateStreamOptions,
    IRetrivalMetadata,
    Message,
    SupportedStreamScipt,
    VideoType,
} from '$/types/index';
import { Auth, StreamScript } from '.';
import { createAgentsApi } from './api/agents';
import { KnowledegeApi, createKnowledgeApi } from './api/knowledge';
import { createRatingsApi } from './api/ratings';
import { SocketManager, createSocketManager } from './connectToSocket';
import { StreamingManager, createStreamingManager } from './createStreamingManager';
import { didApiUrl, didSocketApiUrl, mixpanelKey } from './environment';
import initializeAnalytics, { Analytics } from './services/mixpanel';
import { getAnaliticsInfo } from './utils/analytics';

interface AgentManagreeItems {
    chat?: Chat;
    streamingManager?: StreamingManager<CreateStreamOptions>;
    socketManager?: SocketManager;
}

function getStarterMessages(agent: Agent, knowledgeApi: KnowledegeApi) {
    if (!agent.knowledge?.id) {
        return [];
    }

    return knowledgeApi.getKnowledge(agent.knowledge.id).then(knowledge => knowledge?.starter_message || []);
}

function getAgentStreamArgs(agent: Agent): CreateStreamOptions {
    if (agent.presenter.type === VideoType.Clip) {
        return {
            videoType: VideoType.Clip,
            driver_id: agent.presenter.driver_id,
            presenter_id: agent.presenter.presenter_id,
        };
    }
    return {
        videoType: VideoType.Talk,
        source_url: agent.presenter.source_url,
    };
}

function initializeStreamAndChat(
    agent: Agent,
    options: AgentManagerOptions,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chat?: Chat
) {
    return new Promise<{
        chat: Chat;
        streamingManager: StreamingManager<ReturnType<typeof getAgentStreamArgs>>;
    }>(async (resolve, reject) => {
        const streamingManager = await createStreamingManager(getAgentStreamArgs(agent), {
            ...options,
            callbacks: {
                ...options.callbacks,
                onConnectionStateChange: async state => {
                    if (state === 'connected') {
                        try {
                            if (!chat) {
                                chat = await agentsApi.newChat(agent.id);
                                analytics.track('agent-chat', {
                                    event: 'created',
                                    chatId: chat.id,
                                    agentId: agent.id,
                                });
                            }

                            resolve({ chat, streamingManager });
                        } catch (error: any) {
                            console.error(error);

                            reject(new Error('Cannot create new chat'));
                        }
                    } else if (state === 'failed') {
                        reject(new Error('Cannot create connection'));
                    }

                    options.callbacks.onConnectionStateChange?.(state);
                },
            },
        });
    });
}

export function getAgent(agentId: string, auth: Auth, baseURL?: string): Promise<Agent> {
    const url = baseURL || didApiUrl;
    const agentsApi = createAgentsApi(auth, url);

    return agentsApi.getById(agentId);
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
    const items: AgentManagreeItems = {};

    const baseURL = options.baseURL || didApiUrl;
    const wsURL = options.wsURL || didSocketApiUrl;
    const abortController: AbortController = new AbortController();
    const mxKey = options.mixpanelKey || mixpanelKey;

    const agentsApi = createAgentsApi(options.auth, baseURL);
    const ratingsAPI = createRatingsApi(options.auth, baseURL);
    const knowledgeApi = createKnowledgeApi(options.auth, baseURL);

    const agentInstance = await agentsApi.getById(agent);
    const starterMessages = await getStarterMessages(agentInstance, knowledgeApi);

    const analytics = initializeAnalytics({ mixPanelKey: mxKey, agent: agentInstance, ...options });
    analytics.track('agent-sdk', { event: 'loaded', ...getAnaliticsInfo(agentInstance) });

    return {
        agent: agentInstance,
        chatId: items.chat?.id,
        starterMessages,
        async connect() {
            const socketManager = await createSocketManager(options.auth, wsURL, options.callbacks.onChatEvents);
            const { streamingManager, chat } = await initializeStreamAndChat(
                agentInstance,
                options,
                agentsApi,
                analytics
            );

            analytics.track('agent-chat', { event: 'connect', chatId: chat.id, agentId: agentInstance.id });

            items.streamingManager = streamingManager;
            items.socketManager = socketManager;
            items.chat = chat;
        },
        async disconnect() {
            items.socketManager?.disconnect();
            await items.streamingManager?.disconnect();

            analytics.track('agent-chat', { event: 'disconnect', chatId: items.chat?.id, agentId: agentInstance.id });
        },
        chat(messages: Message[], append_chat: boolean = false) {
            if (messages.length === 0) {
                throw new Error('Messages cannot be empty');
            } else if (!items.chat) {
                throw new Error('Chat is not initialized');
            } else if (!items.streamingManager) {
                throw new Error('Streaming manager is not initialized');
            }
            analytics.track('agent-message-send', { event: 'success', messages: messages.length + 1 });

            messages[messages.length - 1].created_at = new Date().toISOString();
            if (!messages[messages.length - 1].role) {
                messages[messages.length - 1].role = 'user';
            }

            return agentsApi.chat(agentInstance.id, items.chat.id, {
                sessionId: items.streamingManager.sessionId,
                streamId: items.streamingManager.streamId,
                messages,
            });
        },
        rate(score: 1 | -1, matches?: IRetrivalMetadata[], id?: string) {
            if (!items.chat) {
                throw new Error('Chat is not initialized');
            }

            const matchesMapped: [string, string][] = matches?.map(match => [match.document_id, match.id]) ?? [];

            analytics.track('agent-rate', {
                event: id ? 'update' : 'create',
                score: score,
                thumb: score === 1 ? 'up' : 'down',
                knowledge_id: agentInstance.knowledge?.id ?? '',
                matches: matches,
            });

            if (id) {
                return ratingsAPI.update(id, {
                    agent_id: agentInstance.id,
                    knowledge_id: agentInstance.knowledge?.id ?? '',
                    matches: matchesMapped,
                    chat_id: items.chat.id,
                    score,
                });
            }

            return ratingsAPI.create({
                agent_id: agentInstance.id,
                knowledge_id: agentInstance.knowledge?.id ?? '',
                matches: matchesMapped,
                chat_id: items.chat.id,
                score,
            });
        },
        deleteRate(id: string) {
            analytics.track('agent-rate-delete', { type: 'text', chat_id: items.chat?.id, id });
            return ratingsAPI.delete(id);
        },
        speak(payload: SupportedStreamScipt) {
            if (!items.streamingManager) {
                throw new Error('Streaming manager is not initialized');
            }

            function getScript(): StreamScript {
                if (payload.type === 'text') {
                    analytics.track('agent-speak', {
                        type: 'text',
                        provider: payload.provider,
                        input: payload.input,
                        ssml: payload.ssml || false,
                    });

                    let voiceProvider = agentInstance.presenter.voice;

                    if (payload.provider) {
                        voiceProvider = payload.provider;
                    }

                    return {
                        type: 'text',
                        provider: voiceProvider,
                        input: payload.input,
                        ssml: payload.ssml || false,
                    };
                } else if (payload.type === 'audio') {
                    analytics.track('agent-speak', {
                        type: 'audio',
                        audio_url: payload.audio_url,
                    });

                    return {
                        type: 'audio',
                        audio_url: payload.audio_url,
                    };
                }

                throw new Error('Invalid payload');
            }

            return items.streamingManager.speak({ script: getScript() });
        },

        async getStarterMessages() {
            if (!agentInstance.knowledge?.id) {
                return [];
            }

            return knowledgeApi
                .getKnowledge(agentInstance.knowledge.id)
                .then(knowledge => knowledge?.starter_message || []);
        },

        track(event: string, props?: Record<string, any>) {
            if (!options.enableAnalitics) {
                return Promise.reject(new Error('Analytics was disabled on create step'));
            }

            return analytics.track(event, props);
        },
    };
}
