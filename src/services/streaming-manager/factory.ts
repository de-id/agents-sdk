import { Agent, CreateStreamOptions, StreamingManagerOptions, VideoType } from '$/types';
import { createStreamingManager as createWebRTCStreamingManager } from './webrtc-manager';

const isLiveKitAgent = (agent: Agent): boolean => agent.presenter.type === VideoType.Expressive;

export async function createStreamingManager<T extends CreateStreamOptions>(
    agent: Agent,
    streamOptions: T,
    options: StreamingManagerOptions
) {
    if (isLiveKitAgent(agent)) {
        // Lazy import the LiveKit manager only when needed
        const { createLiveKitStreamingManager } = await import('./livekit-manager');
        return createLiveKitStreamingManager(agent.id, streamOptions, options);
    } else {
        return createWebRTCStreamingManager(agent.id, streamOptions, options);
    }
}

export type { StreamingManager } from './common';
export type { LiveKitStreamingManager } from './livekit-manager';
export type { WebRTCStreamingManager } from './webrtc-manager';
