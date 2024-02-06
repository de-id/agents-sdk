import {
    Agent,
    AgentsAPI,
    AgentManagerOptions,
    ChatProgressCallback,
    ConnectionStateChangeCallback,
    CreateStreamOptions,
    Message,
    RatingPayload,
    SupportedStreamScipt,
    VideoStateChangeCallback,
    VideoType,
} from '$/types/index';
import { createStreamingManager } from '..';
import { createAgentsApi } from './api/agents';
import { createRatingssApi } from './api/ratings';
import { SocketManager } from './connectToSocket';
import { CONSTANTS } from './constants';

export function getAgentStreamArgs(agent: Agent): CreateStreamOptions {
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
/**
 * Creates a new Agent Manager instance for interacting with an agent, chat, and related connections.
 *
 * @param {string} agentId - The ID of the agent to chat with.
 * @param {AgentManagerOptions} options - Configurations for the Agent Manager API.
 * * @returns {Promise<AgentsAPI>} - A promise that resolves to an instance of the AgentsAPI interface.
 *
 * @throws {Error} Throws an error if the agent is not initialized.
 *
 * @example
 * const agentManager = await createAgentManager('id-agent123', { auth: { type: 'key', clientKey: '123', externalId: '123' } });
 */

export async function createAgentManager(agentId: string, options: AgentManagerOptions): Promise<AgentsAPI> {
    const baseURL = options.baseURL ? options.baseURL : CONSTANTS.baseURL;
    const abortController: AbortController = new AbortController();
    const agentsApi = createAgentsApi(options.auth, baseURL);

    const agent = await agentsApi.getById(agentId);
    const chat = await agentsApi.newChat(agentId);

    const ratingsAPI = await createRatingssApi(options.auth, baseURL);

    const streamingCallbacks = filterCallbacks(options);
    let streamingAPI = await createStreamingManager(getAgentStreamArgs(agent), {
        ...options,
        callbacks: streamingCallbacks,
    });

    const socketManager = await SocketManager(options.auth);
    await socketManager.connect();

    const resultAPI = {
        agent,
        async reconnectToChat() {
            streamingAPI = await createStreamingManager(getAgentStreamArgs(agent), {
                ...options,
                callbacks: streamingCallbacks,
            });
            streamingAPI.sessionId;
        },
        terminate() {
            abortController.abort();
            socketManager.terminate();
            return streamingAPI.terminate();
        },
        chatId: chat.id,
        chat(messages: Message[]) {
            return agentsApi.chat(
                agentId,
                chat.id,
                { sessionId: streamingAPI.sessionId, streamId: streamingAPI.streamId, messages },
                { signal: abortController.signal }
            );
        },
        rate(payload: RatingPayload, id?: string) {
            if (id) {
                return ratingsAPI.update(id, payload);
            } else {
                return ratingsAPI.create(payload);
            }
        },
        speak(payload: SupportedStreamScipt) {
            if (!agent) {
                throw new Error('Agent not initializated');
            }

            let completePayload: any;

            if (payload.type === 'text') {
                // Handling Stream_Text_Script
                completePayload = {
                    script: {
                        type: 'text',
                        provider: payload.provider,
                        input: payload.input,
                        ssml: payload.ssml || false,
                    },
                };
            } else if (payload.type === 'audio') {
                // Handling Stream_Audio_Script
                completePayload = {
                    script: {
                        type: 'audio',
                        audio_url: payload.audio_url,
                    },
                };
            }

            return streamingAPI.speak(completePayload);
        },
        onChatEvents(callback: ChatProgressCallback) {
            socketManager.subscribeToEvents(callback);
        },
        onConnectionEvents(callback: ConnectionStateChangeCallback) {
            streamingAPI.onCallback('onConnectionStateChange', callback);
        },
        onVideoEvents(callback: VideoStateChangeCallback) {
            streamingAPI.onCallback('onVideoStateChange', callback);
        },
    };

    return resultAPI;
}

function filterCallbacks(options: AgentManagerOptions) {
    const filteredCallbacks: any = {};
    for (const key in options.callbacks) {
        if (options.callbacks[key] !== undefined && options.callbacks[key] !== null) {
            filteredCallbacks[key] = options.callbacks[key];
        }
    }

    return filteredCallbacks;
}

