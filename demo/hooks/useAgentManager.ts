import { createAgentManager } from '@sdk/services/agent-manager';
import {
    AgentActivityState,
    AgentManager,
    Auth,
    ChatMode,
    ConnectionState,
    Message,
    StreamType,
    StreamingState,
} from '@sdk/types';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

interface UseAgentManagerOptions {
    agentId: string;
    baseURL: string;
    wsURL: string;
    mode?: ChatMode;
    auth: Auth;
    streamOptions?: {
        streamWarmup?: boolean;
        sessionTimeout?: number;
        compatibilityMode?: 'on' | 'off' | 'auto';
        fluent?: boolean;
    };
    enableAnalytics?: boolean;
    externalId?: string;
    mixpanelKey?: string;
    mixpanelAdditionalProperties?: Record<string, any>;
    debug?: boolean;
}

export function useAgentManager(props: UseAgentManagerOptions) {
    const {
        agentId,
        baseURL,
        wsURL,
        mode = ChatMode.Functional,
        auth,
        enableAnalytics,
        externalId,
        streamOptions,
        mixpanelKey,
        mixpanelAdditionalProperties,
        debug,
    } = props;

    const [isSpeaking, setIsSpeaking] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [videoState, setVideoState] = useState(StreamingState.Stop);
    const [agentActivityState, setAgentActivityState] = useState(AgentActivityState.Idle);
    const [srcObject, setSrcObject] = useState<MediaStream | null>(null);
    const [agentManager, setAgentManager] = useState<AgentManager | null>(null);
    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.New);
    const streamType = agentManager?.getStreamType();

    useEffect(() => {
        if (streamType === StreamType.Fluent) {
            setIsSpeaking(agentActivityState === AgentActivityState.Talking);
        }
    }, [agentActivityState, streamType]);

    useEffect(() => {
        if (streamType === StreamType.Legacy) {
            setIsSpeaking(videoState === StreamingState.Start);
        }
    }, [videoState, streamType]);

    const connect = useCallback(async () => {
        if (agentManager) return;

        setConnectionState(ConnectionState.Connecting);

        try {
            const newManager: AgentManager = await createAgentManager(agentId, {
                callbacks: {
                    onConnectionStateChange(state: ConnectionState) {
                        setConnectionState(state);

                        if (state !== ConnectionState.Connected) {
                            setAgentManager(null);
                        }
                    },
                    onVideoStateChange(state) {
                        setVideoState(state);
                    },
                    onConnectivityStateChange(state) {
                        console.log('onConnectivityStateChange: ', state);
                    },
                    onNewMessage(newMessages, _type) {
                        setMessages([...newMessages]);
                    },
                    onSrcObjectReady(stream) {
                        setSrcObject(stream);
                    },
                    onAgentActivityStateChange(state) {
                        setAgentActivityState(state);
                    },
                },
                baseURL,
                mode,
                auth,
                wsURL,
                enableAnalitics: enableAnalytics,
                externalId,
                mixpanelKey,
                mixpanelAdditionalProperties,
                streamOptions,
                debug,
            });

            await newManager.connect();
            setAgentManager(newManager);
        } catch (e) {
            setConnectionState(ConnectionState.Fail);

            throw e;
        }
    }, [agentManager, agentId, baseURL, wsURL, mode, auth, enableAnalytics, externalId, streamOptions]);

    const disconnect = useCallback(async () => {
        if (!agentManager) return;

        try {
            await agentManager.disconnect();
        } catch (e) {
            console.error('Error while disconnecting', e);
        } finally {
            setAgentManager(null);
            setSrcObject(null);
            setConnectionState(ConnectionState.New);
            setMessages([]);
        }
    }, [agentManager]);

    const speak = useCallback(
        async (text: string) => {
            if (!agentManager || connectionState !== ConnectionState.Connected) {
                return;
            } else if (!agentManager.agent.presenter) {
                throw new Error('No presenter');
            }

            try {
                setIsSpeaking(true);
                await agentManager.speak({ type: 'text', input: text });
            } catch (e) {
                setConnectionState(ConnectionState.Fail);

                throw e;
            }
        },
        [agentManager, connectionState]
    );

    const chat = useCallback(
        async (userMessage: string) => {
            if (!agentManager || connectionState !== ConnectionState.Connected) return;

            try {
                await agentManager.chat(userMessage.trim());
            } catch (e) {
                if (e instanceof Error && e.message?.includes('User stream has reached pending requests limit')) {
                    console.log('User stream has reached pending requests limit');
                    return;
                }
                setConnectionState(ConnectionState.Fail);

                throw e;
            }
        },
        [agentManager, connectionState]
    );

    const interrupt = useCallback(async () => {
        if (!agentManager || connectionState !== ConnectionState.Connected) return;

        try {
            agentManager.interrupt({ type: 'click' });
        } catch (e) {
            console.error('Error interrupting:', e);
            throw e;
        }
    }, [agentManager, connectionState]);

    const publishMicrophoneStream = useCallback(
        async (stream: MediaStream) => {
            if (!agentManager) {
                console.warn('Agent manager is not initialized yet. Will retry when ready.');
                return;
            }
            if (!agentManager.publishMicrophoneStream) {
                throw new Error('publishMicrophoneStream is not available for this streaming manager');
            }
            await agentManager.publishMicrophoneStream(stream);
        },
        [agentManager]
    );

    const unpublishMicrophoneStream = useCallback(async () => {
        if (!agentManager) {
            console.warn('Agent manager is not initialized yet.');
            return;
        }
        if (!agentManager.unpublishMicrophoneStream) {
            throw new Error('unpublishMicrophoneStream is not available for this streaming manager');
        }
        await agentManager.unpublishMicrophoneStream();
    }, [agentManager]);

    const muteMicrophoneStream = useCallback(async () => {
        if (!agentManager?.muteMicrophoneStream) {
            console.warn('muteMicrophoneStream is not available.');
            return;
        }
        await agentManager.muteMicrophoneStream();
    }, [agentManager]);

    const unmuteMicrophoneStream = useCallback(async () => {
        if (!agentManager?.unmuteMicrophoneStream) {
            console.warn('unmuteMicrophoneStream is not available.');
            return;
        }
        await agentManager.unmuteMicrophoneStream();
    }, [agentManager]);

    const microphoneEnabled = useMemo(() => {
        return (
            agentManager?.agent?.presenter?.type === 'expressive' &&
            typeof agentManager?.publishMicrophoneStream === 'function'
        );
    }, [agentManager]);

    return {
        connectionState,
        messages,
        isSpeaking,
        srcObject,
        connect,
        disconnect,
        speak,
        chat,
        interrupt,
        publishMicrophoneStream,
        unpublishMicrophoneStream,
        muteMicrophoneStream,
        unmuteMicrophoneStream,
        microphoneEnabled,
    };
}
