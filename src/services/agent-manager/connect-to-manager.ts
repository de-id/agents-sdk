import { ChatModeDowngraded } from '$/errors';
import { StreamingManager, createStreamingManager } from '$/services/streaming-manager';
import {
    Agent,
    AgentManagerOptions,
    AgentsAPI,
    Chat,
    ChatMode,
    ConnectionState,
    CreateStreamOptions,
    StreamEvents,
    StreamingState,
    mapVideoType,
} from '$/types';
import { getAgentType } from '$/utils/agent';
import { Analytics } from '../analytics/mixpanel';
import { timestampTracker } from '../analytics/timestamp-tracker';
import { createChat } from '../chat';

function getAgentStreamArgs(agent: Agent, options?: AgentManagerOptions, greeting?: string): CreateStreamOptions {
    const { streamOptions } = options ?? {};

    return {
        videoType: mapVideoType(agent.presenter.type),
        output_resolution: streamOptions?.outputResolution,
        session_timeout: streamOptions?.sessionTimeout,
        stream_warmup: streamOptions?.streamWarmup,
        compatibility_mode: streamOptions?.compatibilityMode,
        stream_greeting:
            getAgentType(agent.presenter) !== 'clip' && options?.streamOptions?.streamGreeting ? greeting : undefined,
    };
}

function handleStateChange(state: StreamingState, agent: Agent, statsReport: any, analytics: Analytics) {
    if (timestampTracker.get() > 0) {
        if (state === StreamingState.Start) {
            analytics.linkTrack('agent-video', { event: 'start', latency: timestampTracker.get(true) }, 'start', [
                StreamEvents.StreamVideoCreated,
            ]);
        } else if (state === StreamingState.Stop) {
            analytics.linkTrack(
                'agent-video',
                {
                    event: 'stop',
                    is_greenscreen: agent.presenter.type === 'clip' && agent.presenter.is_greenscreen,
                    background: agent.presenter.type === 'clip' && agent.presenter.background,
                    ...statsReport,
                },
                'done',
                [StreamEvents.StreamVideoDone]
            );
        }
    }
}

function connectToManager(
    agent: Agent,
    options: AgentManagerOptions,
    analytics: Analytics,
    greeting?: string
): Promise<StreamingManager<CreateStreamOptions>> {
    timestampTracker.reset();

    return new Promise(async (resolve, reject) => {
        try {
            const streamingManager = await createStreamingManager(
                agent.id,
                getAgentStreamArgs(agent, options, greeting),
                {
                    ...options,
                    analytics,
                    callbacks: {
                        ...options.callbacks,
                        onConnectionStateChange: state => {
                            options.callbacks.onConnectionStateChange?.(state);

                            if (state === ConnectionState.Connected) {
                                resolve(streamingManager);
                            }
                        },
                        onVideoStateChange: (state: StreamingState, statsReport?: any) => {
                            options.callbacks.onVideoStateChange?.(state);
                            handleStateChange(state, agent, statsReport, analytics);
                        },
                    },
                }
            );
        } catch (error) {
            reject(error);
        }
    });
}

export async function initializeStreamAndChat(
    agent: Agent,
    options: AgentManagerOptions,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chat?: Chat,
    greeting?: string
): Promise<{ chat?: Chat; streamingManager?: StreamingManager<CreateStreamOptions> }> {
    const { chat: newChat, chatMode } = await createChat(
        agent,
        agentsApi,
        analytics,
        options.mode,
        options.persistentChat,
        chat
    );

    if (chatMode && chatMode !== options.mode) {
        options.mode = chatMode;
        options.callbacks.onModeChange?.(chatMode);

        if (chatMode === ChatMode.TextOnly) {
            options.callbacks.onError?.(new ChatModeDowngraded(chatMode));

            return { chat: newChat };
        }
    }

    const streamingManager = await connectToManager(agent, options, analytics, greeting);

    return { chat: newChat, streamingManager };
}
