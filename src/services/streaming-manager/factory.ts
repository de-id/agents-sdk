import { Agent, CreateStreamOptions, StreamingManagerOptions, VideoType } from '$/types';
import { createWebRTCStreamingManager } from './webrtc-manager';

const isLiveKitAgent = (agent: Agent): boolean => agent.presenter.type === VideoType.Expressive;

export async function createStreamingManager<T extends CreateStreamOptions>(
    agentOrId: Agent | string,
    streamOptions: T,
    options: StreamingManagerOptions
) {
    const agentId = typeof agentOrId === 'string' ? agentOrId : agentOrId.id;

    if (typeof agentOrId !== 'string' && isLiveKitAgent(agentOrId)) {
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
