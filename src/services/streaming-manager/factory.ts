import { Agent, CreateStreamOptions, CreateStreamV2Options, StreamingManagerOptions } from '$/types';
import { isStreamsV2Agent } from '$/utils/agent';
import { createWebRTCStreamingManager } from './webrtc-manager';

export async function createStreamingManager<T extends CreateStreamOptions | CreateStreamV2Options>(
    agent: Agent,
    streamOptions: T,
    options: StreamingManagerOptions
) {
    const agentId = agent.id;

    if (isStreamsV2Agent(agent.presenter.type)) {
        // Lazy import the LiveKit manager only when needed
        const { createLiveKitStreamingManager } = await import('./livekit-manager');
        return createLiveKitStreamingManager(agentId, streamOptions as CreateStreamV2Options, options);
    } else {
        return createWebRTCStreamingManager(agentId, streamOptions as CreateStreamOptions, options);
    }
}
