import { ChatMode, ConnectionState } from '@sdk/types';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import './app.css';
import { agentId, clientKey, debug, didApiUrl, didSocketApiUrl } from './environment';
import { useAgentManager } from './hooks/useAgentManager';

export function App() {
    const [warmup, setWarmup] = useState(true);
    const [text, setText] = useState(
        'Ben bobobobo sagi mamamama . bla raga ode ovem. lol cha cha cha cha cha . bobobobo. cha cha cha cha. bobobobo cha cha cha cha bobobobo. ssssssss cha cha cha cha cha bobobobo . cha cha cha cha bobobobo . cha cha cha cha. bobobobo ssssssss'
    );
    const [mode, setMode] = useState<ChatMode>(ChatMode.Functional);
    const [sessionTimeout, setSessionTimeout] = useState<number | undefined>();
    const [compatibilityMode, setCompatibilityMode] = useState<'on' | 'off' | 'auto'>();
    const [fluent, setFluent] = useState(false);
    const [enableMicrophone, setEnableMicrophone] = useState(true);
    const [microphoneStream, setMicrophoneStream] = useState<MediaStream | undefined>(undefined);
    const microphoneStreamRef = useRef<MediaStream | undefined>(undefined);
    const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('');

    const videoRef = useRef<HTMLVideoElement>(null);

    const { srcObject, connectionState, messages, isSpeaking, connect, disconnect, speak, chat, interrupt } =
        useAgentManager({
            debug,
            agentId,
            baseURL: didApiUrl,
            wsURL: didSocketApiUrl,
            mode,
            enableAnalytics: false,
            auth: { type: 'key', clientKey },
            streamOptions: { streamWarmup: warmup, sessionTimeout, compatibilityMode, fluent },
        });

    const cleanupMicrophoneStream = useCallback(() => {
        if (microphoneStreamRef.current) {
            microphoneStreamRef.current.getTracks().forEach(track => track.stop());
            microphoneStreamRef.current = undefined;
            setMicrophoneStream(undefined);
        }
    }, []);

    const updateAudioDevices = useCallback(async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');

            const realDevices = audioInputs.filter(
                device => !device.label.toLowerCase().includes('blackhole') &&
                    !device.label.toLowerCase().includes('virtual')
            );

            const devicesToShow = realDevices.length > 0 ? realDevices : audioInputs;

            setAudioInputDevices(devicesToShow);

            if (devicesToShow.length > 0 && !selectedAudioDeviceId) {
                setSelectedAudioDeviceId(devicesToShow[0].deviceId);
            }
        } catch (error) {
            console.error('Failed to enumerate audio devices:', error);
        }
    }, [selectedAudioDeviceId]);

    async function onClick() {
        if (connectionState === ConnectionState.New || connectionState === ConnectionState.Fail) {
            let streamToPass: MediaStream | undefined = undefined;

            if (enableMicrophone && !microphoneStreamRef.current) {
                try {
                    const audioConstraints: MediaStreamConstraints['audio'] = selectedAudioDeviceId
                        ? { deviceId: { exact: selectedAudioDeviceId } }
                        : true;

                    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
                    setMicrophoneStream(stream);
                    microphoneStreamRef.current = stream;
                    streamToPass = stream;
                } catch (error) {
                    console.error('Failed to get microphone access:', error);
                    alert('Failed to access microphone. Please check permissions.');
                    return;
                }
            } else if (enableMicrophone) {
                streamToPass = microphoneStreamRef.current || microphoneStream;
            }

            await connect(streamToPass);
        } else if (connectionState === ConnectionState.Connected && text) {
            await speak(text);
        }
    }

    useEffect(() => {
        return cleanupMicrophoneStream;
    }, [cleanupMicrophoneStream]);

    useEffect(() => {
        if (!enableMicrophone && microphoneStreamRef.current) {
            cleanupMicrophoneStream();
        }
    }, [enableMicrophone, cleanupMicrophoneStream]);

    useEffect(() => {
        if (enableMicrophone) {
            updateAudioDevices();
        }
    }, [enableMicrophone, updateAudioDevices]);

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

                        <button onClick={interrupt} disabled={connectionState !== ConnectionState.Connected || !fluent}>
                            Interrupt
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

                            <label>
                                <input
                                    type="checkbox"
                                    name="fluent"
                                    checked={fluent}
                                    onChange={e => setFluent(e.currentTarget.checked)}
                                />
                                Fluent
                            </label>

                            <label>
                                <input
                                    type="checkbox"
                                    name="microphone"
                                    checked={enableMicrophone}
                                    onChange={e => setEnableMicrophone(e.currentTarget.checked)}
                                    disabled={connectionState === ConnectionState.Connected}
                                />
                                Microphone (Expressive only)
                            </label>
                        </div>
                        {enableMicrophone && audioInputDevices.length > 0 && (
                            <div className="input-options" style={{ marginTop: '10px' }}>
                                <label>
                                    Audio Input Device:
                                    <select
                                        value={selectedAudioDeviceId}
                                        onChange={e => setSelectedAudioDeviceId(e.currentTarget.value)}
                                        disabled={connectionState === ConnectionState.Connected}
                                        style={{ marginLeft: '10px', minWidth: '200px' }}>
                                        {audioInputDevices.map(device => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Device ${device.deviceId.substring(0, 8)}`}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        )}
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
