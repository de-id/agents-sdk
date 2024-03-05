import {
    Agent,
    AgentManager,
    AgentManagerOptions,
    AgentsAPI,
    Chat,
    CreateStreamOptions,
    Message,
    RatingPayload,
    SupportedStreamScipt,
    VideoType,
} from '$/types/index';
import { Auth, StreamScript, StreamingManager, createKnowledgeApi, createStreamingManager } from '.';
import { createAgentsApi } from './api/agents';
import AnalyticsProvider from './api/mixPanel';
import { createRatingsApi } from './api/ratings';
import { SocketManager } from './connectToSocket';
import { didApiUrl, didSocketApiUrl, mixpanelKey } from './environment';

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
    analytics: AnalyticsProvider,
    chat?: Chat
) {
    return new Promise<{ chat: Chat; streamingManager: StreamingManager<ReturnType<typeof getAgentStreamArgs>> }>(
        async (resolve, reject) => {
            const streamingManager = await createStreamingManager(getAgentStreamArgs(agent), {
                ...options,
                analytics,
                callbacks: {
                    ...options.callbacks,
                    onConnectionStateChange: async state => {
                        if (state === 'connected') {
                            try {
                                if (!chat) {
                                    chat = await agentsApi.newChat(agent.id);
                                    analytics.setChatId(chat.id);
                                    analytics.track('agent-new-chat', {
                                        event: 'sdk',
                                        agentId: agent.id,
                                        chatId: chat.id,
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
        }
    );
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
export async function createAgentManager(agent: string | Agent, options: AgentManagerOptions): Promise<AgentManager> {
    const baseURL = options.baseURL || didApiUrl;
    const wsURL = options.wsURL || didSocketApiUrl;
    const abortController: AbortController = new AbortController();
    const mxKey = options.mixpanelKey || mixpanelKey;

    const agentsApi = createAgentsApi(options.auth, baseURL);
    const ratingsAPI = createRatingsApi(options.auth, baseURL);
    const knowledgeApi = createKnowledgeApi(options.auth, baseURL);

    const agentInstance = typeof agent === 'string' ? await agentsApi.getById(agent) : agent;
    options.callbacks?.onAgentReady?.(agentInstance);

    // User id from STUDio
    const analytics = AnalyticsProvider.getInstance({ mixPanelKey: mxKey, agentId: agentInstance.id });

    const socketManager = await SocketManager(options.auth, wsURL, options.callbacks.onChatEvents);
    let { chat, streamingManager } = await initializeStreamAndChat(agentInstance, options, agentsApi, analytics);

    return {
        agent: agentInstance,
        chatId: chat.id,
        async reconnectToChat() {
            analytics.track('agent-resume-chat');
            const { streamingManager: newStreamingManager } = await initializeStreamAndChat(
                agentInstance,
                options,
                agentsApi,
                analytics,
                chat
            );

            streamingManager = newStreamingManager;
        },
        terminate() {
            analytics.track('agent-terminate-chat');
            abortController.abort();
            socketManager.terminate();

            return streamingManager.terminate();
        },
        chat(messages: Message[]) {
            analytics.track('agent-message-send', {
                event: 'success',
                messages: messages.length + 1,
            });
            return agentsApi.chat(
                agentInstance.id,
                chat.id,
                { sessionId: streamingManager.sessionId, streamId: streamingManager.streamId, messages },
                { signal: abortController.signal }
            );
        },
        rate(payload: RatingPayload, id?: string) {
            analytics.track('agent-rate', {
                event: id ? 'update' : 'create',
                score: payload.score,
                thumb: payload.score === 1 ? 'up' : 'down',
                knowledge_id: payload.knowledge_id,
                matches: payload.matches,
            });
            if (id) {
                return ratingsAPI.update(id, payload);
            }

            return ratingsAPI.create(payload);
        },
        deleteRate(id: string) {
            analytics.track('agent-rate-delete', {
                rateId: id,
            });
            return ratingsAPI.delete(id);
        },
        speak(payload: SupportedStreamScipt) {
            function getScript(): StreamScript {
                if (payload.type === 'text') {
                    analytics.track('agent-speak', {
                        type: 'text',
                        provider: payload.provider,
                        input: payload.input,
                        ssml: payload.ssml || false,
                    });
                    return {
                        type: 'text',
                        provider: payload.provider,
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

            return streamingManager.speak({ script: getScript() });
        },
        async getStarterMessages() {
            analytics.track('agent-get-starter-messages', {
                agent_id: agentInstance.id,
                chatId: chat.id,
            });
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
