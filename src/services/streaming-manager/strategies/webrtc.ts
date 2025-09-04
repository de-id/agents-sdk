import { Agent, AgentsAPI, Chat, ChatMode, CreateStreamOptions, StreamScript, StreamType } from '$/types/index';
import { initializeStreamAndChat } from '../../agent-manager/connect-to-manager';
import { Analytics } from '../../analytics/mixpanel';
import { sendInterrupt, validateInterrupt } from '../../interrupt';
import { StreamingManager } from '../index';
import { ExtendedAgentManagerOptions, InitializationResult, StreamingStrategy } from './types';

export const createWebRTCStrategy = (): StreamingStrategy => ({
    async initializeStreamAndChat(
        agentEntity: Agent,
        options: ExtendedAgentManagerOptions,
        agentsApi: AgentsAPI,
        analytics: Analytics,
        existingChat?: Chat
    ): Promise<InitializationResult> {
        const connectOptions = {
            ...options,
            mode: options.mode || ChatMode.Functional,
            callbacks: {
                onError: options.callbacks?.onError || (() => {}),
                onConnectionStateChange: options.callbacks?.onConnectionStateChange || (() => {}),
                onSrcObjectReady: options.callbacks?.onSrcObjectReady || (() => {}),
                onVideoStateChange: options.callbacks?.onVideoStateChange || (() => {}),
                onAgentActivityStateChange: options.callbacks?.onAgentActivityStateChange || (() => {}),
                onVideoIdChange: options.callbacks?.onVideoIdChange || (() => {}),
            },
        };

        return initializeStreamAndChat(agentEntity, connectOptions, agentsApi, analytics, existingChat);
    },

    validateSpeakRequest(streamingManager: StreamingManager<CreateStreamOptions>, chatMode: ChatMode): void {
        if (!streamingManager) {
            throw new Error('Please connect to the agent first');
        }
    },

    async speak(
        streamingManager: StreamingManager<CreateStreamOptions>,
        script: StreamScript,
        metadata: { chat_id?: string; agent_id: string }
    ): Promise<any> {
        return streamingManager.speak({
            script,
            metadata,
        });
    },

    validateInterrupt(
        streamingManager: StreamingManager<CreateStreamOptions>,
        streamType: StreamType | undefined,
        videoId: string | null
    ): void {
        validateInterrupt(streamingManager, streamType, videoId);
    },

    interrupt(streamingManager: StreamingManager<CreateStreamOptions>, videoId: string | null): void {
        sendInterrupt(streamingManager, videoId!);
    },
});
