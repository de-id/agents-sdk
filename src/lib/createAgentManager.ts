import {
    Agent,
    AgentManagerOptions,
    CreateStreamOptions,
    Message,
    SupportedStreamScipt,
    VideoType,
    RatingPayload,
    AgentAPI,
} from '$/types/index';
import {createAgentsApi} from './api/agents'
import {  createStreamingManager } from '..';
import { createRatingssApi } from './api/ratings';
import { SocketManager } from './connectToSocket';

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
 * When you call this function, it creates a new chat instance and all related connections.
 * Call it only when the user is ready to send a message to the agent, not when creating the page to reduce costs.
 * @param agentId - agent Id to chat with
 * @param options - configurations of API
 * @summary - entry point to create and work with AgentAPI in SDK
 */

export async function createAgentManager(agentId: string, options: AgentManagerOptions) {
    const abortController: AbortController = new AbortController();
    const agentsApi = createAgentsApi(options.auth, options.baseURL);

    const agent = await agentsApi.getById(agentId);
    const chat = await agentsApi.newChat(agentId);

    const ratingsAPI = await createRatingssApi(options.auth, options.baseURL);

    const streamingCallbacks = filterCallbacks(options);
    let streamingAPI = await createStreamingManager(getAgentStreamArgs(agent), {
        ...options,
        callbacks: streamingCallbacks,
    });

    const socketManager = await SocketManager(options.auth);
    await socketManager.connect();

    return {
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
            if(id) {
                return ratingsAPI.update(id, payload)
            } else {
                return ratingsAPI.create(payload)
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
        onChatEvents(callback: Function) {
            socketManager.subscribeToEvents(callback);
        },
        onConnectionEvents(callback: Function) {
            streamingAPI.addCallback('onConnectionStateChange', callback);
        },
        onVideoEvents(callback: Function) {
            streamingAPI.addCallback('onVideoStateChange', callback);
        },
    };
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

export type AgentsAPI = Awaited<ReturnType<typeof createAgentManager>>;
