import { useRef, useState } from 'preact/hooks';

import { createAgentManager } from '$/createAgentManager';
import { AgentManager, Auth, ChatProgress, ConnectionState, StreamingState } from '$/types';
import './app.css';
import { agentId, didApiUrl, didSocketApiUrl } from './environment';

const auth: Auth = { type: 'key', clientKey: import.meta.env.VITE_CLIENT_KEY };
export function App() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [text, setText] = useState('');
    const [answer, setAnswer] = useState('');
    const [streamState, setStreamState] = useState<ConnectionState>(ConnectionState.New);
    const [agentManager, setAgentManager] = useState<AgentManager>();
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [warmup, setWarmup] = useState(true);
    const [sessionTimeout, setSessionTimeout] = useState(10);
    const [compatibilityMode, setCompatibilityMode] = useState<'on' | 'off' | 'auto'>('on');

    async function onClick() {
        if (!agentManager) {
            setStreamState(ConnectionState.Connecting);

            const agentAPI: AgentManager = await createAgentManager(agentId, {
                callbacks: {
                    onConnectionStateChange(state: ConnectionState) {
                        if (state === ConnectionState.Connected) {
                            setStreamState(ConnectionState.Connected);
                        } else {
                            setAgentManager(undefined);

                            if (state === ConnectionState.New) {
                                setStreamState(ConnectionState.New);
                            } else if (state === ConnectionState.Connecting) {
                                setStreamState(ConnectionState.Connecting);
                            } else if (state === ConnectionState.Fail) {
                                setStreamState(ConnectionState.Fail);
                            }
                        }
                    },
                    onVideoStateChange(state) {
                        setIsSpeaking(state === StreamingState.Start);
                    },
                    onNewMessage(messages, type) {
                        const message = messages.pop()!;
                        if (type === ChatProgress.Partial) {
                            setAnswer(answer => answer + message.content);
                        } else if (type === ChatProgress.Answer) {
                            setAnswer(message.content);
                        }
                    },
                    onSrcObjectReady(value) {
                        if (!videoRef.current) {
                            throw new Error("Couldn't find video ref");
                        }

                        videoRef.current.srcObject = value;
                    },
                },
                baseURL: didApiUrl,
                auth,
                wsURL: didSocketApiUrl,
                distinctId: 'testDistinctIdToSDKTest',
                streamOptions: {
                    stream_warmup: warmup,
                    session_timeout: sessionTimeout,
                    compatibility_mode: compatibilityMode,
                },
            });

            await agentAPI.connect().catch(e => {
                console.error(e);
                setStreamState(ConnectionState.Fail);
                alert(`Failed to connect: ${e.message}`);
            });

            setAgentManager(agentAPI);
        } else if (text && streamState === ConnectionState.Connected) {
            if (!agentManager.agent.presenter) {
                throw new Error('No presenter');
            }

            try {
                agentManager.speak({
                    type: 'text',
                    provider: agentManager.agent.presenter.voice as any,
                    input: text,
                });
            } catch (e) {
                setStreamState(ConnectionState.Fail);
                throw e;
            }
        }
    }

    function disconnect() {
        agentManager?.disconnect();
        setStreamState(ConnectionState.New);
        setAgentManager(undefined);

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }

    return (
        <div id="app">
            <textarea
                type="text"
                placeholder="Enter text to stream"
                value={text}
                onInput={e => setText(e.currentTarget.value)}
            />
            <div id="main-input">
                <button
                    onClick={onClick}
                    disabled={
                        isSpeaking || (!text && ![ConnectionState.New, ConnectionState.Fail].includes(streamState))
                    }>
                    {ConnectionState.Connected === streamState || isSpeaking
                        ? 'Send'
                        : streamState === ConnectionState.Connecting
                          ? 'connecting'
                          : streamState === ConnectionState.Fail
                            ? 'Failed, try again'
                            : 'Connect'}
                </button>
                <button
                    onClick={() =>
                        agentManager?.chat(text.trim()).catch(e => alert(`Failed to send chat: ${e.message}`))
                    }
                    disabled={streamState !== ConnectionState.Connected}>
                    Send to chat text
                </button>
                <button onClick={disconnect} disabled={streamState !== ConnectionState.Connected}>
                    Close connection
                </button>
                <div className="input-options">
                    <label>
                        <input
                            type="checkbox"
                            name="warmup"
                            checked
                            onChange={e => setWarmup(e.currentTarget.checked)}
                        />
                        warmup
                    </label>
                    <input
                        type="text"
                        placeholder="session timeout"
                        onChange={e => setSessionTimeout(parseInt(e.currentTarget.value))}
                    />
                    <input
                        type="text"
                        placeholder="compatibility mode, on | off | auto"
                        onChange={e => setCompatibilityMode(e.currentTarget.value as any)}
                    />
                </div>
            </div>
            {answer && <div>agent answer: {answer}</div>}
            <video
                ref={videoRef}
                id="main-video"
                autoPlay
                playsInline
                className={ConnectionState.Connecting === streamState ? 'animated' : ''}
            />
        </div>
    );
}
