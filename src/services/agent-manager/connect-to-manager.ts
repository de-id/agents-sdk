import { ChatModeDowngraded } from '$/errors';
import { StreamingManager, createStreamingManager } from '$/services/streaming-manager';
import {
    Agent,
    AgentActivityState,
    AgentManagerOptions,
    AgentsAPI,
    Chat,
    ChatMode,
    ConnectionState,
    CreateStreamOptions,
    StreamEvents,
    StreamType,
    StreamingState,
    mapVideoType,
} from '$/types';
import { Analytics } from '../analytics/mixpanel';
import { timestampTracker } from '../analytics/timestamp-tracker';
import { createChat } from '../chat';

function getAgentStreamArgs(agent: Agent, options?: AgentManagerOptions): CreateStreamOptions {
    const { streamOptions } = options ?? {};
    const urlParams = new URLSearchParams(window.location.search);
    const connId = urlParams.get('conn_id') || undefined;

    return {
        videoType: mapVideoType(agent.presenter.type),
        output_resolution: streamOptions?.outputResolution,
        session_timeout: streamOptions?.sessionTimeout,
        stream_warmup: streamOptions?.streamWarmup,
        compatibility_mode: streamOptions?.compatibilityMode,
        fluent: streamOptions?.fluent,
        conn_id: connId,
    };
}

function trackStreamingStateAnalytics(
    state: StreamingState,
    agent: Agent,
    statsReport: any,
    analytics: Analytics,
    streamType: StreamType
) {
    if (timestampTracker.get() > 0) {
        if (state === StreamingState.Start) {
            analytics.linkTrack(
                'agent-video',
                { event: 'start', latency: timestampTracker.get(true), 'stream-type': streamType },
                'start',
                [StreamEvents.StreamVideoCreated]
            );
        } else if (state === StreamingState.Stop) {
            analytics.linkTrack(
                'agent-video',
                {
                    event: 'stop',
                    is_greenscreen: agent.presenter.type === 'clip' && agent.presenter.is_greenscreen,
                    background: agent.presenter.type === 'clip' && agent.presenter.background,
                    'stream-type': streamType,
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
    analytics: Analytics
): Promise<StreamingManager<CreateStreamOptions>> {
    timestampTracker.reset();

    return new Promise(async (resolve, reject) => {
        try {
            const streamingManager = await createStreamingManager(agent.id, getAgentStreamArgs(agent, options), {
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
                        trackStreamingStateAnalytics(state, agent, statsReport, analytics, streamingManager.streamType);
                    },
                    onAgentActivityStateChange: (state: AgentActivityState) => {
                        options.callbacks.onAgentActivityStateChange?.(state);
                        trackStreamingStateAnalytics(
                            state === AgentActivityState.Talking ? StreamingState.Start : StreamingState.Stop,
                            agent,
                            undefined,
                            analytics,
                            streamingManager.streamType
                        );
                    },
                },
            });
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
    chat?: Chat
): Promise<{ chat?: Chat; streamingManager?: StreamingManager<CreateStreamOptions> }> {
    const urlParams = new URLSearchParams(window.location.search);

    const connId = urlParams.get('conn_id') || undefined;
    const externalChatId = urlParams.get('external_chat_id') || undefined;
    const userId = urlParams.get('external_owner_id') || undefined;

    if (externalChatId && userId && connId) {
        console.log('join chat', { connId, externalChatId, userId });

        const chat = await agentsApi.joinChat(userId, connId, externalChatId);
        const streamingManager = await connectToManager(agent, options, analytics);

        return { chat, streamingManager };
    } else {
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

        const streamingManager = await connectToManager(agent, options, analytics);

        return { chat: newChat, streamingManager };
    }
}
