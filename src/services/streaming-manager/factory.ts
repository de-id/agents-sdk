import { Agent, CreateStreamOptions, StreamingManagerOptions, VideoType } from '$/types';
import { createWebRTCStreamingManager } from './webrtc-manager';

const isLiveKitAgent = (agent: Agent): boolean => agent.presenter.type === VideoType.Expressive;

export async function createStreamingManager<T extends CreateStreamOptions>(
    agent: Agent,
    streamOptions: T,
    options: StreamingManagerOptions
) {
    const agentId = agent.id;

    if (isLiveKitAgent(agent)) {
        // Lazy import the LiveKit manager only when needed
        const { createLiveKitStreamingManager } = await import('./livekit-manager');
        return createLiveKitStreamingManager(agentId, streamOptions, options);
    } else {
        return createWebRTCStreamingManager(agentId, streamOptions, options);
    }
}

export type { StreamingManager } from './common';
export type { LiveKitStreamingManager } from './livekit-manager';
export type { WebRTCStreamingManager } from './webrtc-manager';
