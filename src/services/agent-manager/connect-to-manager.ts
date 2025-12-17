import { ChatModeDowngraded } from '@sdk/errors';
import {
    ExtendedStreamOptions,
    StreamApiVersion,
    StreamingManager,
    createStreamingManager,
} from '@sdk/services/streaming-manager';
import {
    Agent,
    AgentActivityState,
    AgentManagerOptions,
    AgentsAPI,
    Chat,
    ChatMode,
    ChatProgressCallback,
    ConnectionState,
    CreateStreamOptions,
    CreateStreamV2Options,
    StreamEvents,
    StreamType,
    StreamingState,
    TransportProvider,
} from '@sdk/types';
import { isStreamsV2Agent } from '@sdk/utils/agent';
import { Analytics } from '../analytics/mixpanel';
import { interruptTimestampTracker, latencyTimestampTracker } from '../analytics/timestamp-tracker';
import { createChat } from '../chat';

function getAgentStreamV2Options(options?: ConnectToManagerOptions): CreateStreamV2Options {
    return {
        transport_provider: TransportProvider.Livekit,
        chat_id: options?.chatId,
    };
}

function getAgentStreamV1Options(options?: ConnectToManagerOptions): CreateStreamOptions {
    const { streamOptions } = options ?? {};

    const endUserData =
        options?.mixpanelAdditionalProperties?.plan !== undefined
            ? {
                  plan: options.mixpanelAdditionalProperties?.plan,
              }
            : undefined;

    const streamArgs = {
        output_resolution: streamOptions?.outputResolution,
        session_timeout: streamOptions?.sessionTimeout,
        stream_warmup: streamOptions?.streamWarmup,
        compatibility_mode: streamOptions?.compatibilityMode,
        fluent: streamOptions?.fluent,
    };

    return { ...streamArgs, ...(endUserData && { end_user_data: endUserData }) };
}

function getAgentStreamOptions(agent: Agent, options?: ConnectToManagerOptions): ExtendedStreamOptions {
    return isStreamsV2Agent(agent.presenter.type)
        ? { version: StreamApiVersion.V2, ...getAgentStreamV2Options(options) }
        : { version: StreamApiVersion.V1, ...getAgentStreamV1Options(options) };
}

function trackVideoStateChangeAnalytics(
    state: StreamingState,
    agent: Agent,
    statsReport: any,
    analytics: Analytics,
    streamType: StreamType
) {
    if (streamType === StreamType.Fluent) {
        trackVideoStreamAnalytics(state, agent, statsReport, analytics, streamType);
    } else {
        trackLegacyVideoAnalytics(state, agent, statsReport, analytics, streamType);
    }
}

function trackVideoStreamAnalytics(
    state: StreamingState,
    agent: Agent,
    statsReport: any,
    analytics: Analytics,
    streamType: StreamType
) {
    if (state === StreamingState.Start) {
        analytics.track('stream-session', { event: 'start', 'stream-type': streamType });
    } else if (state === StreamingState.Stop) {
        analytics.track('stream-session', {
            event: 'stop',
            is_greenscreen: agent.presenter.type === 'clip' && agent.presenter.is_greenscreen,
            background: agent.presenter.type === 'clip' && agent.presenter.background,
            'stream-type': streamType,
            ...statsReport,
        });
    }
}

function trackAgentActivityAnalytics(
    state: StreamingState,
    agent: Agent,
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
                is_greenscreen: agent.presenter.type === 'clip' && agent.presenter.is_greenscreen,
                background: agent.presenter.type === 'clip' && agent.presenter.background,
                'stream-type': streamType,
            },
            'done',
            [StreamEvents.StreamVideoDone]
        );
    }
}

function trackLegacyVideoAnalytics(
    state: StreamingState,
    agent: Agent,
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

type ConnectToManagerOptions = AgentManagerOptions & {
    callbacks: AgentManagerOptions['callbacks'] & {
        onVideoIdChange?: (videoId: string | null) => void;
        /** Internal callback for livekit-manager data channel events */
        onMessage?: ChatProgressCallback;
    };
    chatId?: string;
};

function connectToManager(
    agent: Agent,
    options: ConnectToManagerOptions,
    analytics: Analytics
): Promise<StreamingManager<CreateStreamOptions | CreateStreamV2Options>> {
    latencyTimestampTracker.reset();

    return new Promise(async (resolve, reject) => {
        try {
            let streamingManager: StreamingManager<CreateStreamOptions | CreateStreamV2Options>;
            let shouldResolveOnComplete = false;

            streamingManager = await createStreamingManager(agent, getAgentStreamOptions(agent, options), {
                ...options,
                analytics,
                callbacks: {
                    ...options.callbacks,
                    onConnectionStateChange: state => {
                        options.callbacks.onConnectionStateChange?.(state);

                        if (state === ConnectionState.Connected) {
                            // If manager is ready, resolve immediately
                            // Otherwise, mark to resolve after manager is created
                            if (streamingManager) {
                                resolve(streamingManager);
                            } else {
                                shouldResolveOnComplete = true;
                            }
                        }
                    },
                    onVideoStateChange: (state: StreamingState, statsReport?: any) => {
                        options.callbacks.onVideoStateChange?.(state);

                        trackVideoStateChangeAnalytics(
                            state,
                            agent,
                            statsReport,
                            analytics,
                            streamingManager.streamType
                        );
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
                            agent,
                            analytics,
                            streamingManager.streamType
                        );
                    },
                },
            });

            if (shouldResolveOnComplete) {
                resolve(streamingManager);
            }
        } catch (error) {
            reject(error);
        }
    });
}

export async function initializeStreamAndChat(
    agent: Agent,
    options: ConnectToManagerOptions,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chat?: Chat
): Promise<{ chat?: Chat; streamingManager?: StreamingManager<CreateStreamOptions | CreateStreamV2Options> }> {
    const resolveStreamAndChat = async () => {
        if (isStreamsV2Agent(agent.presenter.type)) {
            const chatResult = await createChat(
                agent,
                agentsApi,
                analytics,
                options.mode,
                options.persistentChat,
                chat
            );
            const streamingManager = await connectToManager(
                agent,
                { ...options, chatId: chatResult.chat?.id },
                analytics
            );
            return { chatResult, streamingManager };
        } else {
            const createChatPromise = createChat(
                agent,
                agentsApi,
                analytics,
                options.mode,
                options.persistentChat,
                chat
            );
            const connectToManagerPromise = connectToManager(agent, options, analytics);
            const [chatResult, streamingManager] = await Promise.all([createChatPromise, connectToManagerPromise]);
            return { chatResult, streamingManager };
        }
    };

    const { chatResult, streamingManager } = await resolveStreamAndChat();
    const { chat: newChat, chatMode } = chatResult;

    if (chatMode && chatMode !== options.mode) {
        options.mode = chatMode;
        options.callbacks.onModeChange?.(chatMode);

        if (chatMode !== ChatMode.Functional) {
            options.callbacks.onError?.(new ChatModeDowngraded(chatMode));

            streamingManager?.disconnect();

            return { chat: newChat };
        }
    }

    return { chat: newChat, streamingManager };
}
