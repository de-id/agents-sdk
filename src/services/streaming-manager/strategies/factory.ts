import { Agent } from '$/types/index';
import { createLiveKitStrategy } from './livekit';
import { StreamingStrategy } from './types';
import { createWebRTCStrategy } from './webrtc';

const isLiveKitAgent = (agent: Agent): boolean => agent.presenter.type === 'expressive';
// const isLiveKitAgent = (agent: Agent): boolean => true; // Temporary for testing

export const streamingManagerStrategyFactory = (agent: Agent): StreamingStrategy =>
    isLiveKitAgent(agent) ? createLiveKitStrategy() : createWebRTCStrategy();
