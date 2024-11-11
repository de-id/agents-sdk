import { useRef, useState } from 'preact/hooks';

import { createAgentManager } from '$/createAgentManager';
import { AgentManager, Auth, ChatMode, ConnectionState, Message, StreamingState } from '$/types';
import './app.css';
import { agentId, didApiUrl, didSocketApiUrl } from './environment';

const auth: Auth = { type: 'key', clientKey: import.meta.env.VITE_CLIENT_KEY };
export function App() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [text, setText] = useState('tell me a story');
    const [messages, setMessages] = useState<Message[]>([]);
    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.New);
    const [agentManager, setAgentManager] = useState<AgentManager>();
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [warmup, setWarmup] = useState(true);
    const [sessionTimeout, setSessionTimeout] = useState<number | undefined>();
    const [compatibilityMode, setCompatibilityMode] = useState<'on' | 'off' | 'auto'>();
    const [mode, setMode] = useState<ChatMode>(ChatMode.Functional);

    async function onClick() {
        if (!agentManager) {
            setConnectionState(ConnectionState.Connecting);

            const agentAPI: AgentManager = await createAgentManager(agentId, {
                callbacks: {
                    onConnectionStateChange(state: ConnectionState) {
                        setConnectionState(state);

                        if (state !== ConnectionState.Connected) {
                            setAgentManager(undefined);
                        }
                    },
                    onVideoStateChange(state) {
                        setIsSpeaking(state === StreamingState.Start);
                    },
                    onNewMessage(messages, _type) {
                        setMessages([...messages]);
                    },
                    onSrcObjectReady(value) {
                        if (!videoRef.current) {
                            throw new Error("Couldn't find video ref");
                        }

                        videoRef.current.srcObject = value;
                    },
                },
                baseURL: didApiUrl,
                mode,
                auth,
                wsURL: didSocketApiUrl,
                distinctId: 'testDistinctIdToSDKTest',
                streamOptions: {
                    streamWarmup: warmup,
                    streamGreeting: true,
                    sessionTimeout: sessionTimeout,
                    compatibilityMode: compatibilityMode,
                },
            });

            await agentAPI.connect().catch(e => {
                console.error(e);
                setConnectionState(ConnectionState.Fail);
                alert(`Failed to connect: ${e.message}`);
            });

            setAgentManager(agentAPI);
        } else if (text && connectionState === ConnectionState.Connected) {
            if (!agentManager.agent.presenter) {
                throw new Error('No presenter');
            }

            agentManager.speak({ type: 'text', input: text }).catch(e => {
                setConnectionState(ConnectionState.Fail);
                throw e;
            });
        } else {
            agentManager.disconnect();
            setAgentManager(undefined);
        }
    }

    function disconnect() {
        agentManager?.disconnect();
        setAgentManager(undefined);

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }

    function sendChat() {
        agentManager?.chat(text.trim()).catch(e => {
            alert(`Failed to send chat: ${e.message}`);
            setConnectionState(ConnectionState.Fail);
            throw e;
        });
    }

    return (
        <>
            <div id="app">
                <fieldset id="main-input" disabled={isSpeaking || connectionState === ConnectionState.Connecting}>
                    <textarea
                        type="text"
                        placeholder="Enter text to stream"
                        value={text}
                        onInput={e => setText(e.currentTarget.value)}
                    />
                    <button
                        onClick={onClick}
                        disabled={
                            isSpeaking ||
                            (!text && ![ConnectionState.New, ConnectionState.Fail].includes(connectionState))
                        }>
                        {ConnectionState.Connected === connectionState || isSpeaking
                            ? 'Send'
                            : connectionState === ConnectionState.Connecting
                              ? 'connecting'
                              : connectionState === ConnectionState.Fail
                                ? 'Failed, try again'
                                : 'Connect'}
                    </button>
                    <button onClick={sendChat} disabled={connectionState !== ConnectionState.Connected}>
                        Send to chat text
                    </button>
                    <button onClick={disconnect} disabled={connectionState !== ConnectionState.Connected}>
                        Close connection
                    </button>
                    <div className="input-options">
                        <select onChange={e => setMode(e.currentTarget.value as ChatMode)}>
                            <option value={ChatMode.Functional} selected={mode === ChatMode.Functional}>
                                Functional
                            </option>
                            <option value={ChatMode.TextOnly} selected={mode === ChatMode.TextOnly}>
                                Text only
                            </option>
                            <option value={ChatMode.DirectPlayback} selected={mode === ChatMode.DirectPlayback}>
                                DirectPlayback
                            </option>
                            <option value={ChatMode.Playground} selected={mode === ChatMode.Playground}>
                                Playground
                            </option>
                        </select>
                        <label>
                            <input
                                type="checkbox"
                                name="warmup"
                                checked={warmup}
                                onChange={e => setWarmup(e.currentTarget.checked)}
                            />
                            warmup
                        </label>
                        <input
                            type="text"
                            placeholder="session timeout"
                            value={sessionTimeout}
                            onChange={e => setSessionTimeout(parseInt(e.currentTarget.value))}
                        />
                        <input
                            type="text"
                            value={compatibilityMode}
                            placeholder="compatibility mode, on | off | auto"
                            onChange={e => setCompatibilityMode(e.currentTarget.value as any)}
                        />
                    </div>
                </fieldset>
                <video
                    ref={videoRef}
                    id="main-video"
                    autoPlay
                    playsInline
                    className={ConnectionState.Connecting === connectionState ? 'animated' : ''}
                />
            </div>
            {messages.length > 0 && (
                <pre>
                    {JSON.stringify(
                        messages.map(m => [m.role, m.content].join(': ')),
                        null,
                        4
                    )}
                </pre>
            )}
        </>
    );
}
