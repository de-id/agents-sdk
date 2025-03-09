import { ChatMode, ConnectionState } from '$/types';
import { useEffect, useRef, useState } from 'preact/hooks';

import './app.css';
import { agentId, didApiUrl, didSocketApiUrl } from './environment';
import { useAgentManager } from './hooks/useAgentManager';

export function App() {
    const [warmup, setWarmup] = useState(true);
    const [greeting, setGreeting] = useState(true);
    const [text, setText] = useState('tell me a story');
    const [mode, setMode] = useState<ChatMode>(ChatMode.Functional);
    const [sessionTimeout, setSessionTimeout] = useState<number | undefined>();
    const [compatibilityMode, setCompatibilityMode] = useState<'on' | 'off' | 'auto'>();

    const videoRef = useRef<HTMLVideoElement>(null);

    const { srcObject, connectionState, messages, isSpeaking, connect, disconnect, speak, chat } = useAgentManager({
        agentId,
        baseURL: didApiUrl,
        wsURL: didSocketApiUrl,
        mode,
        auth: { type: 'key', clientKey: import.meta.env.VITE_CLIENT_KEY },
        streamOptions: {
            streamWarmup: warmup,
            streamGreeting: greeting,
            sessionTimeout,
            compatibilityMode,
        },
        enableAnalytics: false,
        distinctId: 'testDistinctIdToSDKTest',
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
                    <fieldset id="main-input" disabled={connectionState === ConnectionState.Connecting}>
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

                        <select value={mode} onChange={e => setMode(e.currentTarget.value as ChatMode)}>
                            <option value={ChatMode.Functional}>{ChatMode.Functional}</option>
                            <option value={ChatMode.Playground}>{ChatMode.Playground}</option>
                            <option value={ChatMode.TextOnly}>{ChatMode.TextOnly}</option>
                            <option value={ChatMode.Maintenance}>{ChatMode.Maintenance}</option>
                            <option value={ChatMode.DirectPlayback}>{ChatMode.DirectPlayback}</option>
                        </select>

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

                            <label>
                                <input
                                    type="checkbox"
                                    name="greeting"
                                    checked={greeting}
                                    onChange={e => setGreeting(e.currentTarget.checked)}
                                />
                                Greeting
                            </label>
                        </div>
                    </fieldset>
                </div>

                <div id="right">
                    <video
                        ref={videoRef}
                        id="main-video"
                        autoPlay
                        playsInline
                        className={connectionState === ConnectionState.Connecting ? 'animated' : ''}
                    />
                </div>
            </section>
            <footer>
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
