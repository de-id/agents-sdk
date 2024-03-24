import {
    Agent,
    AgentManager,
    AgentManagerOptions,
    AgentsAPI,
    Chat,
    CreateStreamOptions,
    Message,
    SupportedStreamScipt,
    VideoType,
} from '$/types/index';
import { Auth, StreamScript } from '.';
import { createAgentsApi } from './api/agents';
import { KnowledegeApi, createKnowledgeApi } from './api/knowledge';
import { createRatingsApi } from './api/ratings';
import { SocketManager } from './connectToSocket';
import { StreamingManager, createStreamingManager } from './createStreamingManager';
import { didApiUrl, didSocketApiUrl } from './environment';

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

function initializeStreamAndChat(agent: Agent, options: AgentManagerOptions, agentsApi: AgentsAPI, chat?: Chat) {
    return new Promise<{ chat: Chat; streamingManager: StreamingManager<ReturnType<typeof getAgentStreamArgs>> }>(
        async (resolve, reject) => {
            const streamingManager = await createStreamingManager(getAgentStreamArgs(agent), {
                ...options,
                callbacks: {
                    ...options.callbacks,
                    onConnectionStateChange: async state => {
                        if (state === 'connected') {
                            try {
                                if (!chat) {
                                    chat = await agentsApi.newChat(agent.id);
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
    const agentsApi = createAgentsApi(options.auth, baseURL);
    const ratingsAPI = createRatingsApi(options.auth, baseURL);
    const knowledgeApi = createKnowledgeApi(options.auth, baseURL);

    const agentInstance = typeof agent === 'string' ? await agentsApi.getById(agent) : agent;
    options.callbacks?.onAgentReady?.(agentInstance);

    const socketManager = await SocketManager(options.auth, wsURL, options.callbacks.onChatEvents);
    let { chat, streamingManager } = await initializeStreamAndChat(agentInstance, options, agentsApi);
    const starterMessages = await getStarterMessages(agentInstance, knowledgeApi);

    return {
        agent: agentInstance,
        chatId: chat.id,
        starterMessages,
        async reconnect() {
            const { streamingManager: newStreamingManager } = await initializeStreamAndChat(
                agentInstance,
                options,
                agentsApi,
                chat
            );

            streamingManager = newStreamingManager;
        },
        disconnect() {
            abortController.abort();
            socketManager.disconnect();

            return streamingManager.disconnect();
        },
        chat(messages: Message[], append_chat: boolean = false) {
            if (messages.length === 0) {
                throw new Error('Messages cannot be empty');
            }

            messages[messages.length - 1].created_at = new Date().toISOString();
            if (!messages[messages.length - 1].role) {
                messages[messages.length - 1].role = 'user';
            }

            return agentsApi.chat(
                agentInstance.id,
                chat.id,
                { sessionId: streamingManager.sessionId, streamId: streamingManager.streamId, messages, append_chat },
                { signal: abortController.signal }
            );
        },
        rate(score: 1 | -1, message: Message, id?: string) {
            const matches: [string, string][] = message.matches?.map(match => [match.document_id, match.id]) ?? [];

            if (id) {
                return ratingsAPI.update(id, {
                    agent_id: agentInstance.id,
                    knowledge_id: agentInstance.knowledge?.id ?? '',
                    chat_id: chat.id,
                    score,
                    matches,
                });
            }

            return ratingsAPI.create({
                agent_id: agentInstance.id,
                knowledge_id: agentInstance.knowledge?.id ?? '',
                chat_id: chat.id,
                score,
                matches,
            });
        },
        deleteRate(id: string) {
            return ratingsAPI.delete(id);
        },
        speak(payload: SupportedStreamScipt) {
            function getScript(): StreamScript {
                if (payload.type === 'text') {
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
                    return {
                        type: 'audio',
                        audio_url: payload.audio_url,
                    };
                }

                throw new Error('Invalid payload');
            }

            return streamingManager.speak({ script: getScript() });
        },
    };
}
