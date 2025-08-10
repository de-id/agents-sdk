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
} from '$/types';
import { Analytics } from '../analytics/mixpanel';
import { interruptTimestampTracker, latencyTimestampTracker } from '../analytics/timestamp-tracker';
import { createChat } from '../chat';

function getAgentStreamArgs(options?: AgentManagerOptions): CreateStreamOptions {
    const { streamOptions } = options ?? {};

    return {
        // TODO: this should be fetched in the backend
        // videoType: mapVideoType(agent.presenter.type),
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
    if (state === StreamingState.Start) {
        analytics.track('stream-session', { event: 'start', 'stream-type': streamType });
    } else if (state === StreamingState.Stop) {
        analytics.track('stream-session', {
            event: 'stop',
            'stream-type': streamType,
            ...statsReport,
        });
    }
}

function trackAgentActivityAnalytics(state: StreamingState, analytics: Analytics, streamType: StreamType) {
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
                'stream-type': streamType,
                ...statsReport,
            },
            'done',
            [StreamEvents.StreamVideoDone]
        );
    }
}

type ConnectToManagerOptions = AgentManagerOptions & {
    callbacks: AgentManagerOptions['callbacks'] & {
        onVideoIdChange?: (videoId: string | null) => void;
    };
};

function connectToManager(
    agentId: string,
    options: ConnectToManagerOptions,
    analytics: Analytics
): Promise<StreamingManager<CreateStreamOptions>> {
    const startTime = performance.now();
    console.log(`[PERF] connectToManager started at ${new Date().toISOString()}`);

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
                            const endTime = performance.now();
                            console.log(`[PERF] connectToManager completed in ${(endTime - startTime).toFixed(2)}ms`);
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
    options: ConnectToManagerOptions,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chat?: Chat
): Promise<{ chat?: Chat; streamingManager?: StreamingManager<CreateStreamOptions> }> {
    const startTime = performance.now();
    console.log(`[PERF] initializeStreamAndChat started at ${new Date().toISOString()}`);

    // Start both operations in parallel
    const [chatResult, streamingManager] = await Promise.all([
        createChat(agentId, agentsApi, analytics, options.mode, options.persistentChat, chat),
        connectToManager(agentId, options, analytics),
    ]);

    const parallelEndTime = performance.now();
    console.log(`[PERF] Parallel operations completed in ${(parallelEndTime - startTime).toFixed(2)}ms`);

    const { chat: newChat, chatMode } = chatResult;

    // Handle mode changes and text-only logic
    if (chatMode && chatMode !== options.mode) {
        options.mode = chatMode;
        options.callbacks.onModeChange?.(chatMode);

        if (chatMode === ChatMode.TextOnly) {
            options.callbacks.onError?.(new ChatModeDowngraded(chatMode));

            return { chat: newChat };
        }
    }

    const totalTime = performance.now() - startTime;
    console.log(`[PERF] initializeStreamAndChat completed in ${totalTime.toFixed(2)}ms`);

    return { chat: newChat, streamingManager };
}
