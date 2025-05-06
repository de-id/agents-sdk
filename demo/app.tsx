import { ChatMode, ConnectionState } from '$/types';
import { useEffect, useRef, useState } from 'preact/hooks';

import './app.css';
import { agentId, clientKey, didApiUrl, didSocketApiUrl } from './environment';
import { useAgentManager } from './hooks/useAgentManager';

export function App() {
    const [warmup, setWarmup] = useState(true);
    const [text, setText] = useState(
        'oded bobobobo sagi mamamama . bla raga ode ovem. lol cha cha cha cha cha . bobobobo. cha cha cha cha. bobobobo cha cha cha cha bobobobo. ssssssss cha cha cha cha cha bobobobo . cha cha cha cha bobobobo . cha cha cha cha. bobobobo ssssssss'
    );
    const [mode, setMode] = useState<ChatMode>(ChatMode.Functional);
    const [sessionTimeout, setSessionTimeout] = useState<number | undefined>();
    const [compatibilityMode, setCompatibilityMode] = useState<'on' | 'off' | 'auto'>();

    const videoRef = useRef<HTMLVideoElement>(null);

    const { srcObject, connectionState, messages, isSpeaking, connect, disconnect, speak, chat } = useAgentManager({
        agentId,
        baseURL: didApiUrl,
        wsURL: didSocketApiUrl,
        mode,
        enableAnalytics: false,
        auth: { type: 'key', clientKey },
        streamOptions: {
            streamWarmup: warmup,
            sessionTimeout,
            compatibilityMode,
        },
    });

    async function onClick() {
        if (connectionState === ConnectionState.New || connectionState === ConnectionState.Fail) {
            await connect();
        } else if (connectionState === ConnectionState.Connected && text) {
            await speak(text);
        }
    }

    useEffect(() => {
        if (srcObject && videoRef.current) {
            videoRef.current.srcObject = srcObject;
        }
    }, [srcObject]);

    return (
        <div id="app">
            <section>
                <div id="left">
                    <textarea
                        type="text"
                        placeholder="Enter text to stream"
                        value={text}
                        onInput={e => setText(e.currentTarget.value)}
                    />
                </div>

                <div id="right">
                    <fieldset id="main-input" disabled={connectionState === ConnectionState.Connecting}>
                        <button
                            onClick={onClick}
                            disabled={
                                isSpeaking ||
                                (!text && ![ConnectionState.New, ConnectionState.Fail].includes(connectionState))
                            }>
                            {connectionState === ConnectionState.Connected
                                ? 'Send'
                                : connectionState === ConnectionState.Connecting
                                  ? 'Connecting...'
                                  : connectionState === ConnectionState.Fail
                                    ? 'Failed, Try Again'
                                    : 'Connect'}
                        </button>

                        <button
                            onClick={() => chat(text)}
                            disabled={isSpeaking || connectionState !== ConnectionState.Connected}>
                            Send to Chat
                        </button>

                        <button onClick={disconnect} disabled={connectionState !== ConnectionState.Connected}>
                            Close Connection
                        </button>

                        <div className="input-options">
                            <label>
                                <input
                                    type="checkbox"
                                    name="warmup"
                                    checked={warmup}
                                    onChange={e => setWarmup(e.currentTarget.checked)}
                                />
                                Warmup
                            </label>
                        </div>
                    </fieldset>
                </div>
            </section>
            <footer>
                <video
                    ref={videoRef}
                    id="main-video"
                    autoPlay
                    playsInline
                    className={connectionState === ConnectionState.Connecting ? 'animated' : ''}
                />
                <div id="options">
                    <input
                        type="text"
                        placeholder="Session Timeout"
                        value={sessionTimeout}
                        onChange={e => setSessionTimeout(parseInt(e.currentTarget.value) || undefined)}
                    />
                    <input
                        type="text"
                        value={compatibilityMode}
                        placeholder="Compatibility Mode (on | off | auto)"
                        onChange={e => setCompatibilityMode(e.currentTarget.value as 'on' | 'off' | 'auto')}
                    />
                    <select value={mode} onChange={e => setMode(e.currentTarget.value as ChatMode)}>
                        <option value={ChatMode.Functional}>{ChatMode.Functional}</option>
                        <option value={ChatMode.Playground}>{ChatMode.Playground}</option>
                        <option value={ChatMode.TextOnly}>{ChatMode.TextOnly}</option>
                        <option value={ChatMode.Maintenance}>{ChatMode.Maintenance}</option>
                        <option value={ChatMode.DirectPlayback}>{ChatMode.DirectPlayback}</option>
                    </select>
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
            </footer>
        </div>
    );
}
