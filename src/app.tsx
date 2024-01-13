import { StreamingManager, createStreamingManager } from '$/createStreamingManager';
import { createAgentsApi } from '$/index';
import { Agent, Auth, ClipStreamOptions, CreateStreamOptions, StreamingState, VideoType } from '%/index'
import { useEffect, useRef, useState } from 'preact/hooks';
import './app.css';
import { clientKey, didApiUrl } from './environment';

function getAgentStreamArgs(agent: Agent): CreateStreamOptions {
    if (agent.presenter?.type === VideoType.Clip) {
        return {
            videoType: VideoType.Clip,
            driver_id: agent.presenter.driver_id,
            presenter_id: agent.presenter.presenter_id,
        };
    } else {
        return {
            videoType: VideoType.Talk,
            source_url: agent.presenter?.source_url ?? (agent as any).image_url,
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

    useEffect(() => {
        createAgentsApi(auth, 'https://api-dev.d-id.com').getById('agt_UtWyAZbk').then(setAgent);
    }, [auth]);

    async function onClick() {
        if (agent) {
            if ([State.New, State.Fail].includes(streamState)) {
                setStreamState(State.Connecting);
                await rtcConnection?.terminate();
                const newRtcConnection = await createStreamingManager(getAgentStreamArgs(agent), {
                    auth: { type: 'key', clientKey },
                    baseURL: didApiUrl,
                    callbacks: {
                        onConnectionStateChange(state) {
                            console.log('state', state);

                            if (state === 'connected') {
                                setStreamState(State.Connected);
                            } else if (state === 'new') {
                                setStreamState(State.New);
                            } else if (state === 'closed') {
                                setStreamState(State.New);
                            } else if (state === 'checking') {
                                setStreamState(State.Connecting);
                            } else if (state === 'failed') {
                                setStreamState(State.Fail);
                            } else if (state === 'disconnected') {
                                setStreamState(State.New);
                            }
                        },
                        onVideoStateChange(state) {
                            setStreamState(streamState => {
                                if (streamState === State.Speaking) {
                                    return state === StreamingState.Stop ? State.Connected : State.Speaking;
                                }

                                return streamState;
                            });
                        },
                        onSrcObjectReady(value) {
                            if (!videoRef.current) {
                                throw new Error("Couldn't find video ref");
                            }

                            videoRef.current.srcObject = value;
                        },
                    },
                }).catch(e => {
                    setStreamState(State.Fail);
                    throw e;
                });

                setRtcConnection(newRtcConnection);
            } else if (streamState === State.Connected && text && rtcConnection) {
                setStreamState(State.Speaking);

                await rtcConnection
                    .speak({
                        script: {
                            type: 'text',
                            provider: agent.presenter.voice,
                            input: text,
                        },
                    })
                    .catch(e => {
                        console.log(e);
                        setStreamState(State.Fail);
                    });
            }
        }
    }

    function terminate() {
        rtcConnection?.terminate();
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
                <button onClick={terminate} disabled={streamState !== State.Connected}>
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
