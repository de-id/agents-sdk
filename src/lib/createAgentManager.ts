import {
    Agent,
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
 * @returns {Promise<AgentsAPI>} - A promise that resolves to an instance of the AgentsAPI interface.
 *
 * @throws {Error} Throws an error if the agent is not initialized.
 *
 * @example
 * const agentManager = await createAgentManager('id-agent123', { auth: { type: 'key', clientKey: '123', externalId: '123' } });
 */

export async function createAgentManager(agentId: string, options: AgentManagerOptions) {
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
        /**
         * Agent instance you are working with
         * to know more about agents go to https://docs.d-id.com/reference/agents
         */
        agent,
        /**
         * Method to be reconnected to chat
         * Since chat uses an RTC connection to communicate with the agent, it could be dropped and to continue chat you need to reconnect
         */
        async reconnectToChat() {
            streamingAPI = await createStreamingManager(getAgentStreamArgs(agent), {
                ...options,
                callbacks: streamingCallbacks,
            });
            streamingAPI.sessionId;
        },
        /**
         * Method to close all connections with agent, stream and web socket
         */
        terminate() {
            abortController.abort();
            socketManager.terminate();
            return streamingAPI.terminate();
        },
        /**
         * ID of chat you are working on now
         */
        chatId: chat.id,
        /**
         * Method to send a chat message to existing chat with the agent
         * @param messages
         */
        chat(messages: Message[]) {
            return agentsApi.chat(
                agentId,
                chat.id,
                { sessionId: streamingAPI.sessionId, streamId: streamingAPI.streamId, messages },
                { signal: abortController.signal }
            );
        },
        /**
         * This method provides you the possibility to rate your chat experience
         * @param payload
         * @param id - id of Rating entity. Leave it empty to create a new, one or pass it to work with the existing one
         */
        rate(payload: RatingPayload, id?: string) {
            if (id) {
                return ratingsAPI.update(id, payload);
            } else {
                return ratingsAPI.create(payload);
            }
        },
        /**
         * Method to make your agent to read text you provide
         * @param payload
         */
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
        /**
         * Optional callback function that will be triggered each time any changes happen in the chat
         * @param callback
         */
        onChatEvents(callback: ChatProgressCallback) {
            socketManager.subscribeToEvents(callback);
        },
        /**
         * Optional callback function that will be triggered each time the RTC connection gets new status
         * @param callback
         */
        onConnectionEvents(callback: ConnectionStateChangeCallback) {
            streamingAPI.addCallback('onConnectionStateChange', callback);
        },
        /**
         * Optional callback function that will be triggered each time video events happen
         * @param callback
         */
        onVideoEvents(callback: VideoStateChangeCallback) {
            streamingAPI.addCallback('onVideoStateChange', callback);
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

export type AgentsAPI = Awaited<ReturnType<typeof createAgentManager>>;
