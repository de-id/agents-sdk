import { createAgentManager } from '$/services/agent-manager';
import { AgentManager, Auth, ChatMode, ConnectionState, Message, StreamingState } from '$/types';
import { useCallback, useState } from 'preact/hooks';

interface StreamOptions {
    streamWarmup?: boolean;
    streamGreeting?: boolean;
    sessionTimeout?: number;
    compatibilityMode?: 'on' | 'off' | 'auto';
}

interface UseAgentManagerOptions {
    agentId: string;
    baseURL: string;
    wsURL: string;
    mode?: ChatMode;
    auth: Auth;
    enableAnalytics?: boolean;
    distinctId?: string;
    streamOptions?: StreamOptions;
}

export function useAgentManager({
    agentId,
    baseURL,
    wsURL,
    mode = ChatMode.Functional,
    auth,
    enableAnalytics = false,
    distinctId,
    streamOptions,
}: UseAgentManagerOptions) {
    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.New);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [srcObject, setSrcObject] = useState<MediaStream | null>(null);
    const [agentManager, setAgentManager] = useState<AgentManager | null>(null);

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
                        setIsSpeaking(state === StreamingState.Start);
                    },
                    onNewMessage(newMessages, _type) {
                        setMessages([...newMessages]);
                    },
                    onSrcObjectReady(stream) {
                        setSrcObject(stream);
                    },
                },
                baseURL,
                mode,
                auth,
                wsURL,
                enableAnalitics: enableAnalytics,
                distinctId,
                streamOptions,
            });

            await newManager.connect();
            setAgentManager(newManager);
        } catch (e) {
            setConnectionState(ConnectionState.Fail);

            throw e;
        }
    }, [agentManager, agentId, baseURL, wsURL, mode, auth, enableAnalytics, distinctId, streamOptions]);

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
                setConnectionState(ConnectionState.Fail);

                throw e;
            }
        },
        [agentManager, connectionState]
    );

    return {
        connectionState,
        messages,
        isSpeaking,
        srcObject,
        connect,
        disconnect,
        speak,
        chat,
    };
}
