import { Agent, AgentManagerOptions, CreateStreamOptions, Message, VideoType } from '%/index';
import { createAgentsApi, createStreamingManager } from '.';

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

export async function createAgentManager(agentId: string, { callbacks, ...options }: AgentManagerOptions) {
    const abortController: AbortController = new AbortController();
    const agentsApi = createAgentsApi(options.auth, options.baseURL);

    const agent = await agentsApi.getById(agentId);
    const chat = await agentsApi.newChat(agentId);
    const { terminate, sessionId, streamId } = await createStreamingManager(getAgentStreamArgs(agent), {
        ...options,
        callbacks: {
            onSrcObjectReady: callbacks.onSrcObjectReady,
            onVideoStateChange: callbacks?.onVideoStateChange,
            onConnectionStateChange: callbacks.onConnectionStateChange,
        },
    });

    return {
        agent,
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
    };
}

export type AgentManager = Awaited<ReturnType<typeof createAgentManager>>;
