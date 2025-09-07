import { Agent, CreateStreamOptions, StreamingManagerOptions } from '$/types';
import { createLiveKitStreamingManager } from './livekit-manager';
import { createStreamingManager as createWebRTCStreamingManager } from './webrtc-manager';

const isLiveKitAgent = (agent: Agent): boolean => agent.presenter.type === VideoType.Expressive;

export async function createStreamingManager<T extends CreateStreamOptions>(
    agent: Agent,
    streamOptions: T,
    options: StreamingManagerOptions
) {
    return isLiveKitAgent(agent)
        ? createLiveKitStreamingManager(agent.id, streamOptions, options)
        : createWebRTCStreamingManager(agent.id, streamOptions, options);
}

export type { StreamingManager } from './common';
export type { LiveKitStreamingManager } from './livekit-manager';
export type { WebRTCStreamingManager } from './webrtc-manager';
