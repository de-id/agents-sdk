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
    AudioDetectionMetrics,
    Chat,
    ChatMode,
    ChatProgressCallback,
    ConnectionState,
    CreateSessionV2Options,
    CreateSessionV2Response,
    CreateStreamOptions,
    Interrupt,
    StreamEvents,
    StreamType,
    StreamingState,
    VideoType,
} from '@sdk/types';
import { buildCreateSessionV2Options, isStreamsV2Agent } from '@sdk/utils/agent';
import { Analytics } from '../analytics/mixpanel';
import {
    interruptTimestampTracker,
    latencyTimestampTracker,
    streamReadyTimestampTracker,
} from '../analytics/timestamp-tracker';
import { createChat } from '../chat';

const ChatPrefix = 'cht';

function getAgentStreamV2Options(): CreateSessionV2Options {
    return buildCreateSessionV2Options();
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
        ? { version: StreamApiVersion.V2, ...getAgentStreamV2Options() }
        : { version: StreamApiVersion.V1, ...getAgentStreamV1Options(options) };
}

function trackConnectionStateChangeAnalytics(state: ConnectionState, reason: string | undefined, analytics: Analytics) {
    analytics.track('agent-connection-state-change', { state, ...(reason && { reason }) });
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
            is_greenscreen: agent.presenter.type === VideoType.Clip && agent.presenter.is_greenscreen,
            background: agent.presenter.type === VideoType.Clip && agent.presenter.background,
            'stream-type': streamType,
            ...statsReport,
        });
    }
}

function trackAgentActivityAnalytics(
    state: StreamingState,
    agent: Agent,
    analytics: Analytics,
    streamType: StreamType,
    metrics?: AudioDetectionMetrics
) {
    if (state === StreamingState.Start) {
        analytics.linkTrack('agent-video', { event: 'start', ...metrics, 'stream-type': streamType }, 'start', [
            StreamEvents.StreamVideoCreated,
        ]);
    } else if (state === StreamingState.Stop) {
        analytics.linkTrack(
            'agent-video',
            {
                event: 'stop',
                is_greenscreen: agent.presenter.type === VideoType.Clip && agent.presenter.is_greenscreen,
                background: agent.presenter.type === VideoType.Clip && agent.presenter.background,
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
                is_greenscreen: agent.presenter.type === VideoType.Clip && agent.presenter.is_greenscreen,
                background: agent.presenter.type === VideoType.Clip && agent.presenter.background,
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
        /** Internal callback for when interrupt is detected by streaming manager */
        onInterruptDetected?: (interrupt: Interrupt) => void;
        onFirstAudioDetected?: (metrics: AudioDetectionMetrics) => void;
    };
    chatId?: string;
};

/**
 * Creates a streaming manager for the given agent and resolves once the
 * underlying stream is `Connected`.
 *
 * @param agent - The agent entity to stream.
 * @param options - Connect-time options plus internal callbacks.
 * @param analytics - The analytics client for tracking connection events.
 * @param signal - Optional AbortSignal. Only honored on the V1 path.
 * @param preCreatedSession - Optional V2 session already created upstream (via
 *   the parallel-init optimization). When provided, the LiveKit manager reuses
 *   it instead of calling `createStream` again. Ignored on the V1 path.
 * @returns A streaming manager ready for use.
 */
function connectToManager(
    agent: Agent,
    options: ConnectToManagerOptions,
    analytics: Analytics,
    signal?: AbortSignal,
    preCreatedSession?: CreateSessionV2Response
): Promise<StreamingManager<CreateStreamOptions | CreateSessionV2Options>> {
    latencyTimestampTracker.reset();
    streamReadyTimestampTracker.update();

    return new Promise(async (resolve, reject) => {
        try {
            let streamingManager: StreamingManager<CreateStreamOptions | CreateSessionV2Options>;
            let shouldResolveOnComplete = false;
            const streamOptions = getAgentStreamOptions(agent, options);

            analytics.enrich({
                'stream-version': streamOptions.version.toString(),
            });

            let pendingStartTrack: ((metrics?: AudioDetectionMetrics) => void) | null = null;
            const isExpressive = agent.presenter.type === VideoType.Expressive;

            streamingManager = await createStreamingManager(
                agent,
                streamOptions,
                {
                    ...options,
                    analytics,
                    preCreatedSession,
                    callbacks: {
                        ...options.callbacks,
                        onConnectionStateChange: (state, reason) => {
                            options.callbacks.onConnectionStateChange?.(state);

                            trackConnectionStateChangeAnalytics(state, reason, analytics);

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
                                pendingStartTrack = metrics => {
                                    trackAgentActivityAnalytics(
                                        StreamingState.Start,
                                        agent,
                                        analytics,
                                        streamingManager.streamType,
                                        metrics
                                    );
                                    pendingStartTrack = null;
                                };
                                if (!isExpressive) {
                                    pendingStartTrack({ latency: latencyTimestampTracker.get(true) });
                                }
                            } else {
                                interruptTimestampTracker.reset();
                                pendingStartTrack = null;
                                trackAgentActivityAnalytics(
                                    StreamingState.Stop,
                                    agent,
                                    analytics,
                                    streamingManager.streamType
                                );
                            }
                        },
                        onFirstAudioDetected: metrics => {
                            pendingStartTrack?.(metrics);
                        },
                        onStreamReady: () => {
                            const readyLatency = streamReadyTimestampTracker.get(true);
                            analytics.track('agent-chat', { event: 'ready', latency: readyLatency });
                        },
                    },
                },
                signal
            );

            if (shouldResolveOnComplete) {
                resolve(streamingManager);
            }
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Initializes both the streaming manager and the chat for an agent.
 *
 * For V2 agents, the chat is synthesized from the session id and no chat API
 * call is made. For V1 agents, the stream connect and chat creation run in
 * parallel with shared abort semantics on failure.
 *
 * @param agent - The agent entity to connect to.
 * @param options - Connect-time options including callbacks.
 * @param agentsApi - The agents API client (used for V1 chat creation).
 * @param analytics - The analytics client.
 * @param chat - Optional existing chat to resume (V1 only).
 * @param preCreatedSession - Optional V2 session created upstream via the
 *   parallel-init optimization. Forwarded to the LiveKit manager for reuse.
 *   Consumed once by the caller.
 * @returns The streaming manager and the resolved chat.
 */
export async function initializeStreamAndChat(
    agent: Agent,
    options: ConnectToManagerOptions,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chat?: Chat,
    preCreatedSession?: CreateSessionV2Response
): Promise<{ chat?: Chat; streamingManager?: StreamingManager<CreateStreamOptions | CreateSessionV2Options> }> {
    const resolveStreamAndChat = async () => {
        if (isStreamsV2Agent(agent.presenter.type)) {
            const streamingManager = await connectToManager(agent, options, analytics, undefined, preCreatedSession);
            const chatId = `${ChatPrefix}_${streamingManager.sessionId}`;
            const now = new Date().toISOString();

            const chatResult = {
                chatMode: ChatMode.Functional,
                chat: {
                    id: chatId,
                    agent_id: agent.id,
                    owner_id: agent.owner_id ?? '',
                    created: now,
                    modified: now,
                    agent_id__created_at: now,
                    agent_id__modified_at: now,
                    chat_mode: ChatMode.Functional,
                    messages: [],
                },
            };
            return { chatResult, streamingManager };
        } else {
            const abortController = new AbortController();
            const signal = abortController.signal;
            let streamingManagerRef: StreamingManager<CreateStreamOptions | CreateSessionV2Options> | undefined;

            try {
                const createChatPromise = createChat(
                    agent,
                    agentsApi,
                    analytics,
                    options.mode,
                    options.persistentChat,
                    chat
                );
                const connectToManagerPromise = connectToManager(agent, options, analytics, signal).then(manager => {
                    streamingManagerRef = manager;
                    return manager;
                });

                const [chatResult, streamingManager] = await Promise.all([createChatPromise, connectToManagerPromise]);
                return { chatResult, streamingManager };
            } catch (error) {
                abortController.abort();

                if (streamingManagerRef) {
                    await streamingManagerRef.disconnect().catch(() => {});
                }

                throw error;
            }
        }
    };

    const { chatResult, streamingManager } = await resolveStreamAndChat();
    const { chat: newChat, chatMode } = chatResult;

    if (chatMode && options.mode !== undefined && chatMode !== options.mode) {
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
