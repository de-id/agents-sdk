import { StreamingManager, createStreamingManager } from '$/services/streaming-manager';
import {
    Agent,
    AgentManagerOptions,
    ConnectionState,
    CreateStreamOptions,
    StreamEvents,
    StreamingState,
    mapVideoType,
} from '$/types';
import { timestampTracker } from '../analytics/timestamp-tracker';
import { Analytics } from '../analytics/mixpanel';

function getAgentStreamArgs(agent: Agent, options?: AgentManagerOptions, greeting?: string): CreateStreamOptions {
    const { streamOptions } = options ?? {};

    return {
        videoType: mapVideoType(agent.presenter.type),
        output_resolution: streamOptions?.outputResolution,
        session_timeout: streamOptions?.sessionTimeout,
        stream_warmup: streamOptions?.streamWarmup,
        compatibility_mode: streamOptions?.compatibilityMode,
        stream_greeting: streamOptions?.streamGreeting ? greeting : undefined,
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

export function connectToManager(
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
                    warmup: options.streamOptions?.streamWarmup,
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
