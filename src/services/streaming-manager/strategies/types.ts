import { Agent, AgentsAPI, Chat, ChatMode, CreateStreamOptions, StreamScript, StreamType } from '$/types/index';
import { Analytics } from '../../analytics/mixpanel';
import { StreamingManager } from '../index';

export interface ExtendedAgentManagerOptions {
    auth: any;
    baseURL?: string;
    mode?: ChatMode;
    persistentChat?: boolean;
    callbacks?: {
        onError?: (error: Error, context?: any) => void;
        onConnectionStateChange?: (state: any) => void;
        onSrcObjectReady?: (stream: MediaStream) => void;
        onVideoStateChange?: (state: any) => void;
        onAgentActivityStateChange?: (state: any) => void;
        onVideoIdChange?: (videoId: string | null) => void;
    };
}

export interface InitializationResult {
    streamingManager?: StreamingManager<CreateStreamOptions>;
    chat?: Chat;
}

export interface StreamingStrategy {
    initializeStreamAndChat(
        agentEntity: Agent,
        options: ExtendedAgentManagerOptions,
        agentsApi: AgentsAPI,
        analytics: Analytics,
        existingChat?: Chat
    ): Promise<InitializationResult>;
    validateSpeakRequest(streamingManager: StreamingManager<CreateStreamOptions>, chatMode: ChatMode): void;
    speak(
        streamingManager: StreamingManager<CreateStreamOptions>,
        script: StreamScript,
        metadata: { chat_id?: string; agent_id: string }
    ): Promise<any>;
    validateInterrupt(
        streamingManager: StreamingManager<CreateStreamOptions>,
        streamType: StreamType | undefined,
        videoId: string | null
    ): void;
    interrupt(streamingManager: StreamingManager<CreateStreamOptions>, videoId: string | null): void;
}
