import {
    Agent,
    AgentManagerOptions,
    CreateStreamOptions,
    Message,
    SendStreamPayloadResponse,
    VideoType,
} from '$/types/index';
import { SocketManager, createAgentsApi, createStreamingManager } from '..';

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
 * When you call this function it create a new chat instanse and all related connections
 * Call it only when user ready to send message to agent 
 * Not when creating page to reduce costs
 * @param agentId - agent Id to chat with
 * @param options - configurations object
 * @returns 
 */

export async function createAgentsAPI(agentId: string, options: AgentManagerOptions) {
    const abortController: AbortController = new AbortController();
    const agentsApi = createAgentsApi(options.auth, options.baseURL);

    const agent = await agentsApi.getById(agentId);
    const chat = await agentsApi.newChat(agentId);
    const socketManager = await SocketManager(options.auth);
    console.log('here');
    let terminate: () => Promise<void>, sessionId: string, streamId: string, speak: (input) => Promise<SendStreamPayloadResponse>;

    ({ terminate, sessionId, streamId, speak } = await createStreamingManager(getAgentStreamArgs(agent), {
        ...options,
        callbacks: {
            onSrcObjectReady: options.callbacks.onSrcObjectReady,
            onVideoStateChange: options.callbacks?.onVideoStateChange,
            onConnectionStateChange: options.callbacks.onConnectionStateChange,
        },
    }));

    socketManager.connect();

    return {
        agent,
        async reconnectToChat() {
            ({ terminate, sessionId, streamId, speak } = await createStreamingManager(getAgentStreamArgs(agent), {
                ...options,
                callbacks: {
                    onSrcObjectReady: options.callbacks.onSrcObjectReady,
                    onVideoStateChange: options.callbacks?.onVideoStateChange,
                    onConnectionStateChange: options.callbacks.onConnectionStateChange,
                },
            }));
        },
        terminate() {
            abortController.abort();
            return terminate();
        },
        chatId: chat.id,
        chat(messages: Message[]) {
            return agentsApi.chat(
                agentId,
                chat.id,
                { sessionId, streamId, messages },
                { signal: abortController.signal }
            );
        },
        //TODO rate
        rate() {

        },
        // TODO describe later
        // https://docs.d-id.com/reference/createtalkstream
        speak(input: string, type?: 'text' | 'voice') {
            if (!agent) {
                throw new Error('Agent not initializated');
            } else if (!agent.presenter.voice) {
                throw new Error(`Agent do not have possibility yo speak`);
            }

            speak({
                script: {
                    type: 'text',
                    provider: agent.presenter.voice,
                    input,
                },
            });
        },
        onChatEvents(callback: Function) {
            console.log("onChatEvents api")
            socketManager.subscribeToEvents(callback)
        }
    };
}

export type AgentsAPI = Awaited<ReturnType<typeof createAgentsAPI>>;
