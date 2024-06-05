import { useRef, useState } from 'preact/hooks';

import { createAgentManager } from '$/createAgentManager';
import { AgentManager, Auth, ChatProgress, ConnectionState, StreamingState } from '$/types';
import './app.css';
import { agentId, didApiUrl, didSocketApiUrl } from './environment';

enum State {
    New,
    Fail,
    Connecting,
    Connected,
    Speaking,
}

const auth: Auth = { type: 'key', clientKey: import.meta.env.VITE_CLIENT_KEY };
export function App() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [text, setText] = useState('');
    const [answer, setAnswer] = useState('');
    const [streamState, setStreamState] = useState<State>(State.New);
    const [agentManager, setAgentManager] = useState<AgentManager>();
    const [isConnecting, setIsConnecting] = useState(false);

    const onConnectionStateChange = function (state: ConnectionState) {
        if (state === ConnectionState.Connected) {
            setStreamState(State.Connected);
        } else if (state === ConnectionState.New) {
            setStreamState(State.New);
        } else if (state === ConnectionState.Connecting) {
            setStreamState(State.Connecting);
        } else if (state === ConnectionState.Fail) {
            setStreamState(State.Fail);
        }
    };

    const onVideoStateChange = function (state) {
        setStreamState(streamState => {
            if (streamState === State.Speaking) {
                return state === StreamingState.Stop ? State.Connected : State.Speaking;
            }

            return streamState;
        });
    };

    const onChatEvents = function (event, data) {
        if (event === ChatProgress.Partial) {
            setAnswer(answer => answer + data.content);
        } else if (event === ChatProgress.Answer) {
            setAnswer(data.content);
        }
    };

    const callbacks = {
        onSrcObjectReady(value) {
            if (!videoRef.current) {
                throw new Error("Couldn't find video ref");
            }

            videoRef.current.srcObject = value;
        },
        onConnectionStateChange,
        onVideoStateChange,
        onChatEvents,
    };

    async function onClick() {
        if (!agentManager) {
            setIsConnecting(true);

            const agentAPI: AgentManager = await createAgentManager(agentId, {
                callbacks,
                baseURL: didApiUrl,
                auth,
                wsURL: didSocketApiUrl,
                distinctId: 'testDistinctIdToSDKTest',
            });

            await agentAPI.connect();
            setAgentManager(agentAPI);
        } else if (text) {
            if (!agentManager.agent.presenter) {
                throw new Error('No presenter');
            }

            setStreamState(State.Speaking);

            try {
                agentManager.speak({
                    type: 'text',
                    provider: agentManager.agent.presenter.voice as any,
                    input: text,
                });
            } catch (e) {
                console.error(e);
                setStreamState(State.Fail);
            }
        }
    }

    async function onChat() {
        agentManager?.chat(text.trim());
    }

    function disconnect() {
        agentManager?.disconnect();
        setStreamState(State.New);
    }

    return (
        <div id="app">
            <div id="main-input">
                <textarea
                    type="text"
                    placeholder="Enter text to stream"
                    value={text}
                    onInput={e => setText(e.currentTarget.value)}
                />
                <span>agent answer: {answer}</span>
                <button
                    onClick={onClick}
                    disabled={
                        [State.Speaking].includes(streamState) ||
                        (!text && ![State.New, State.Fail].includes(streamState)) ||
                        isConnecting
                    }>
                    {[State.Connected, State.Speaking].includes(streamState)
                        ? 'Send'
                        : isConnecting
                          ? 'connecting'
                          : streamState === State.Fail
                            ? 'Failed, try again'
                            : 'Connect'}
                </button>
                <button onClick={onChat} disabled={streamState !== State.Connected}>
                    Send to chat text
                </button>
                <button onClick={disconnect} disabled={streamState !== State.Connected}>
                    Close connection
                </button>
            </div>
            <video
                ref={videoRef}
                id="main-video"
                autoPlay
                playsInline
                className={[State.Connecting, State.Speaking].includes(streamState) ? 'animated' : ''}
            />
        </div>
    );
}
