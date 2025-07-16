import { ChatModeDowngraded } from '$/errors';
import { StreamingManager, createStreamingManager } from '$/services/streaming-manager';
import {
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
    VideoType,
} from '$/types';
import { Analytics } from '../analytics/mixpanel';
import { interruptTimestampTracker, latencyTimestampTracker } from '../analytics/timestamp-tracker';
import { createChat } from '../chat';
import { getGlobalAgentEntity } from './agent-store';

function getAgentStreamArgs(options?: AgentManagerOptions): CreateStreamOptions {
    const agent = getGlobalAgentEntity();
    const { streamOptions } = options ?? {};

    return {
        videoType: agent?.presenter.type as VideoType,
        output_resolution: streamOptions?.outputResolution,
        session_timeout: streamOptions?.sessionTimeout,
        stream_warmup: streamOptions?.streamWarmup,
        compatibility_mode: streamOptions?.compatibilityMode,
        fluent: streamOptions?.fluent,
    };
}

function trackVideoStateChangeAnalytics(
    state: StreamingState,
    statsReport: any,
    analytics: Analytics,
    streamType: StreamType
) {
    if (streamType === StreamType.Fluent) {
        trackVideoStreamAnalytics(state, statsReport, analytics, streamType);
    } else {
        trackLegacyVideoAnalytics(state, statsReport, analytics, streamType);
    }
}

function trackVideoStreamAnalytics(
    state: StreamingState,
    statsReport: any,
    analytics: Analytics,
    streamType: StreamType
) {
    const agent = getGlobalAgentEntity();
    if (state === StreamingState.Start) {
        analytics.track('stream-session', { event: 'start', 'stream-type': streamType });
    } else if (state === StreamingState.Stop) {
        analytics.track('stream-session', {
            event: 'stop',
            is_greenscreen: agent?.presenter?.type === 'clip' && agent?.presenter.is_greenscreen,
            background: agent?.presenter?.type === 'clip' && agent?.presenter.background,
            'stream-type': streamType,
            ...statsReport,
        });
    }
}

function trackAgentActivityAnalytics(state: StreamingState, analytics: Analytics, streamType: StreamType) {
    const agent = getGlobalAgentEntity();
    if (latencyTimestampTracker.get() <= 0) return;

    if (state === StreamingState.Start) {
        analytics.linkTrack(
            'agent-video',
            { event: 'start', latency: latencyTimestampTracker.get(true), 'stream-type': streamType },
            'start',
            [StreamEvents.StreamVideoCreated]
        );
    } else if (state === StreamingState.Stop) {
        analytics.linkTrack(
            'agent-video',
            {
                event: 'stop',
                is_greenscreen: agent?.presenter?.type === 'clip' && agent?.presenter.is_greenscreen,
                background: agent?.presenter?.type === 'clip' && agent?.presenter.background,
                'stream-type': streamType,
            },
            'done',
            [StreamEvents.StreamVideoDone]
        );
    }
}

function trackLegacyVideoAnalytics(
    state: StreamingState,
    statsReport: any,
    analytics: Analytics,
    streamType: StreamType
) {
    const agent = getGlobalAgentEntity();
    if (latencyTimestampTracker.get() <= 0) return;

    if (state === StreamingState.Start) {
        analytics.linkTrack(
            'agent-video',
            { event: 'start', latency: latencyTimestampTracker.get(true), 'stream-type': streamType },
            'start',
            [StreamEvents.StreamVideoCreated]
        );
    } else if (state === StreamingState.Stop) {
        analytics.linkTrack(
            'agent-video',
            {
                event: 'stop',
                is_greenscreen: agent?.presenter?.type === 'clip' && agent?.presenter.is_greenscreen,
                background: agent?.presenter?.type === 'clip' && agent?.presenter.background,
                'stream-type': streamType,
                ...statsReport,
            },
            'done',
            [StreamEvents.StreamVideoDone]
        );
    }
}

function connectToManager(
    agentId: string,
    options: AgentManagerOptions,
    analytics: Analytics
): Promise<StreamingManager<CreateStreamOptions>> {
    latencyTimestampTracker.reset();

    return new Promise(async (resolve, reject) => {
        try {
            const streamingManager = await createStreamingManager(agentId, getAgentStreamArgs(options), {
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

                        trackVideoStateChangeAnalytics(state, statsReport, analytics, streamingManager.streamType);
                    },
                    onAgentActivityStateChange: (state: AgentActivityState) => {
                        options.callbacks.onAgentActivityStateChange?.(state);

                        if (state === AgentActivityState.Talking) {
                            interruptTimestampTracker.update();
                        } else {
                            interruptTimestampTracker.reset();
                        }

                        trackAgentActivityAnalytics(
                            state === AgentActivityState.Talking ? StreamingState.Start : StreamingState.Stop,
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
    agentId: string,
    options: AgentManagerOptions,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chat?: Chat
): Promise<{ chat?: Chat; streamingManager?: StreamingManager<CreateStreamOptions> }> {
    const { chat: newChat, chatMode } = await createChat(
        agentId,
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

    const time = Date.now();
    const streamingManager = await connectToManager(agentId, options, analytics);
    console.log('connectToManager', Date.now() - time, 'ms');
    return { chat: newChat, streamingManager };
}
