import { StreamingManager } from '$/createStreamingManager';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
    Agent,
    AgentManager,
    Auth,
    ChatProgress,
    ClipStreamOptions,
    ConnectionState,
    CreateStreamOptions,
    StreamingState,
    VideoType,
    createAgentManager,
} from '../src/types/index';
import './app.css';
import { agentId, clientKey, didApiUrl, didSocketApiUrl } from './environment';

function getAgentStreamArgs(agent: Agent): CreateStreamOptions {
    if (agent.presenter?.type === VideoType.Clip) {
        return {
            videoType: VideoType.Clip,
            driver_id: agent.presenter.driver_id,
            presenter_id: agent.presenter.presenter_id,
            stream_warmup: true,
        };
    } else {
        return {
            videoType: VideoType.Talk,
            source_url: agent.presenter?.source_url ?? (agent as any).image_url,
            stream_warmup: true,
        };
    }
}

enum State {
    New,
    Fail,
    Connecting,
    Connected,
    Speaking,
}

const auth: Auth = { type: 'key', clientKey };
export function App() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [rtcConnection, setRtcConnection] = useState<StreamingManager<ClipStreamOptions> | null>(null);
    const [streamState, setStreamState] = useState<State>(State.New);
    const [text, setText] = useState('');
    const [agent, setAgent] = useState<Agent>();
    const [agentAPI, setAgentAPI] = useState<AgentManager>();
    const [answer, setAnswer] = useState('');

    useEffect(() => {
        // createAgentsApi(auth, 'https://api-dev.d-id.com').getById(agentId).then(setAgent);
    }, [auth]);

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

    const onVideoStateChange = function (state, data) {
        setStreamState(streamState => {
            if (streamState === State.Speaking) {
                return state === StreamingState.Stop ? State.Connected : State.Speaking;
            }

            return streamState;
        });
        if (state === StreamingState.Stop && data) {
            console.log('Video stats', data);
        }
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
        if (!agentAPI) {
            const agentAPI: AgentManager = await createAgentManager(agentId, {
                callbacks,
                baseURL: didApiUrl,
                auth,
                wsURL: didSocketApiUrl,
                distinctId: 'testDistinctIdToSDKTest',
            });
            setAgentAPI(agentAPI);
        } else if (text) {
            setStreamState(State.Speaking);
            try {
                agentAPI.speak({
                    type: 'text',
                    provider: agentAPI.agent.presenter.voice as any,
                    input: text,
                });
            } catch (e) {
                console.error(e);
                setStreamState(State.Fail);
            }
        }
    }

    async function onChat() {
        const response = agentAPI?.chat(text.trim(), true);
    }

    function disconnect() {
        agentAPI?.disconnect();
        setRtcConnection(null);
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
                        [State.Connecting, State.Speaking].includes(streamState) ||
                        (!text && ![State.New, State.Fail].includes(streamState))
                    }>
                    {[State.Connected, State.Speaking].includes(streamState)
                        ? 'Send'
                        : streamState === State.Connecting
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
