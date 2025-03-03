import { PLAYGROUND_HEADER } from '$/consts';
import { StreamingManager, createStreamingManager } from '$/createStreamingManager';
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
import { SdkError } from '$/utils/SdkError';
import { Analytics } from '../mixpanel';

let messageSentTimestamp = 0;

function getAgentStreamArgs(agent: Agent, options?: AgentManagerOptions, greeting?: string): CreateStreamOptions {
    return {
        videoType: mapVideoType(agent.presenter.type),
        output_resolution: options?.streamOptions?.outputResolution,
        session_timeout: options?.streamOptions?.sessionTimeout,
        stream_warmup: options?.streamOptions?.streamWarmup,
        compatibility_mode: options?.streamOptions?.compatibilityMode,
        stream_greeting: options?.streamOptions?.streamGreeting ? greeting : undefined,
    };
}

export function getRequestHeaders(chatMode?: ChatMode): Record<string, Record<string, string>> {
    return chatMode === ChatMode.Playground ? { headers: { [PLAYGROUND_HEADER]: 'true' } } : {};
}

export async function newChat(
    agentId: string,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chatMode?: ChatMode,
    persist?: boolean
) {
    try {
        const newChat = await agentsApi.newChat(agentId, { persist: persist ?? false }, getRequestHeaders(chatMode));

        analytics.track('agent-chat', { event: 'created', chat_id: newChat.id, agent_id: agentId, mode: chatMode });

        return newChat;
    } catch (error: any) {
        let parsedError;

        try {
            parsedError = JSON.parse(error.message);
        } catch (jsonError) {
            console.error('Error parsing the error message:', jsonError);
        }

        throw new Error(
            parsedError?.kind === 'InsufficientCreditsError' ? 'InsufficientCreditsError' : 'Cannot create new chat'
        );
    }
}

export function initializeStreamAndChat(
    agent: Agent,
    options: AgentManagerOptions,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chat?: Chat,
    greeting?: string
) {
    return new Promise<{ chat?: Chat; streamingManager?: StreamingManager<CreateStreamOptions> }>(
        async (resolve, reject) => {
            messageSentTimestamp = 0;
            const initialChatMode = String(options.mode) as ChatMode;

            if (!chat && options.mode !== ChatMode.DirectPlayback) {
                try {
                    chat = await newChat(agent.id, agentsApi, analytics, options.mode, options.persistentChat);
                } catch (error) {
                    return reject(error);
                }
            }

            const returnedChatMode: ChatMode = chat?.chat_mode || initialChatMode;

            if (returnedChatMode !== initialChatMode) {
                options.mode = returnedChatMode;
                options.callbacks.onModeChange?.(returnedChatMode);

                if (returnedChatMode === ChatMode.TextOnly) {
                    options.callbacks?.onError?.(
                        new SdkError({
                            kind: 'ChatModeDowngraded',
                            description: `Chat mode changed from ${initialChatMode} to ${returnedChatMode} when creating the chat`,
                        }),
                        {}
                    );
                }
            }

            if (returnedChatMode === ChatMode.TextOnly) {
                return resolve({ chat });
            }

            const streamingManager = await createStreamingManager(
                agent.id,
                getAgentStreamArgs(agent, options, greeting),
                {
                    ...options,
                    analytics,
                    warmup: options.streamOptions?.streamWarmup,
                    callbacks: {
                        ...options.callbacks,
                        onConnectionStateChange: async state => {
                            if (state === ConnectionState.Connected) {
                                if (streamingManager) {
                                    options.callbacks.onConnectionStateChange?.(state);
                                    resolve({ chat, streamingManager });
                                } else if (chat) {
                                    reject(new Error('Something went wrong while initializing the manager'));
                                }
                            } else {
                                options.callbacks.onConnectionStateChange?.(state);
                            }
                        },
                        onVideoStateChange(state, statsReport?) {
                            options.callbacks.onVideoStateChange?.(state);

                            if (messageSentTimestamp > 0) {
                                if (state === StreamingState.Start) {
                                    analytics.linkTrack(
                                        'agent-video',
                                        { event: 'start', latency: Date.now() - messageSentTimestamp },
                                        'start',
                                        [StreamEvents.StreamVideoCreated]
                                    );
                                } else if (state === StreamingState.Stop) {
                                    analytics.linkTrack(
                                        'agent-video',
                                        {
                                            event: 'stop',
                                            is_greenscreen:
                                                agent.presenter.type === 'clip' && agent.presenter.is_greenscreen,
                                            background: agent.presenter.type === 'clip' && agent.presenter.background,
                                            ...statsReport,
                                        },
                                        'done',
                                        [StreamEvents.StreamVideoDone]
                                    );
                                }
                            }
                        },
                    },
                }
            ).catch(reject);
        }
    );
}
