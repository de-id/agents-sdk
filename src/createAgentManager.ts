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
                                    analytics.track('agent-chat', {
                                        event: 'created',
                                        chatId: chat.id,
                                        agentId: agent.id
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

function getInitAnaliticsInfo(agent: Agent) {
    const mobileOrDesktop = () => {
        return /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';
    };
    const getUserOS = () => {
        var platform = navigator.platform;

        if (platform.toLowerCase().includes('win')) {
            return 'Windows';
        } else if (platform.toLowerCase().includes('mac')) {
            return 'Mac OS X';
        } else if (platform.toLowerCase().includes('linux')) {
            return 'Linux';
        } else {
            return 'Unknown'; // Unable to determine the OS
        }
    };
    return {
        $os: `${getUserOS()}`,
        isMobile: `${mobileOrDesktop() == 'Mobile'}`,
        browser: navigator.userAgent,
        origin: window.location.origin,
        agentType: agent.presenter.type,
        agentVoice: {
            voiceId: agent.presenter.voice?.voice_id,
            provider: agent.presenter.voice?.type,
        },
    };
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

    const analytics = AnalyticsProvider.getInstance({
        mixPanelKey: mxKey,
        agent: agentInstance,
        ...options,
    });

    const socketManager = await SocketManager(options.auth, wsURL, options.callbacks.onChatEvents);
    let { chat, streamingManager } = await initializeStreamAndChat(agentInstance, options, agentsApi, analytics);

    analytics.track('agent-sdk', {event: 'loaded', ...getInitAnaliticsInfo(agentInstance)});

    return {
        agent: agentInstance,
        chatId: chat.id,
        async reconnectToChat() {
            analytics.track('agent-chat', 
            {
                event: 'resume', 
                chatId: chat.id,
                agentId: agent.id
            });
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
            analytics.track('agent-chat', 
            { 
                event: 'terminated', 
                chatId: chat.id,
                agentId: agent.id 
            });
            abortController.abort();
            socketManager.terminate();

            return streamingManager.terminate();
        },
        chat(messages: Message[]) {
            const messageSentTimestamp = Date.now();
            analytics.track('agent-message-send', {
                event: 'success',
                messages: messages.length + 1,
            });

            return agentsApi
                .chat(
                    agentInstance.id,
                    chat.id,
                    { sessionId: streamingManager.sessionId, streamId: streamingManager.streamId, messages },
                    { signal: abortController.signal }
                )
                .then(response => {
                    analytics.track('agent-message-received', {
                        latency: Date.now() - messageSentTimestamp,
                        messages: messages.length + 1,
                    });
                    return response;
                })
                .catch(error => {
                    analytics.track('agent-message-send', {
                        event: 'error',
                        reason: error.message ?? "", // Assuming error has a message property
                    });

                    throw error;
                });
        },
        rate(payload: RatingPayload, id?: string) {
            analytics.track('agent-rate', {
                event: id ? 'update' : 'create',
                score: payload.score,
                thumb: payload.score === 1 ? 'up' : 'down',
                knowledgeId: payload.knowledge_id,
                matches: payload.matches,
            });
            if (id) {
                return ratingsAPI.update(id, payload);
            }

            return ratingsAPI.create(payload);
        },
        deleteRate(id: string) {
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
