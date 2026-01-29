import { ConnectionState } from '@sdk/types';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

interface UseMicrophoneStreamOptions {
    connectionState: ConnectionState;
    microphoneSupported: boolean; // Whether the presenter supports microphone
    publishMicrophoneStream?: (stream: MediaStream) => Promise<void>;
    unpublishMicrophoneStream?: () => Promise<void>;
    muteMicrophoneStream?: () => Promise<void>;
    unmuteMicrophoneStream?: () => Promise<void>;
}

export function useMicrophoneStream(options: UseMicrophoneStreamOptions) {
    const {
        connectionState,
        microphoneSupported,
        publishMicrophoneStream,
        unpublishMicrophoneStream,
        muteMicrophoneStream,
        unmuteMicrophoneStream,
    } = options;

    const [isEnabled, setIsEnabled] = useState(true); // User's checkbox preference
    const [isPublished, setIsPublished] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [stream, setStream] = useState<MediaStream | undefined>(undefined);
    const streamRef = useRef<MediaStream | undefined>(undefined);
    const isPublishingRef = useRef(false); // Guard against double-publish race condition
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

    const findRealMicrophoneDevice = useCallback(async (): Promise<string | undefined> => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');

            const realDevices = audioInputs.filter(
                device =>
                    !device.label.toLowerCase().includes('blackhole') &&
                    !device.label.toLowerCase().includes('virtual')
            );

            if (realDevices.length > 0) {
                console.log('[useMicrophoneStream] Found real microphone:', realDevices[0].label);
                return realDevices[0].deviceId;
            }

            // Fall back to first available if no "real" devices found
            if (audioInputs.length > 0) {
                return audioInputs[0].deviceId;
            }

            return undefined;
        } catch (error) {
            console.error('[useMicrophoneStream] Failed to enumerate devices:', error);
            return undefined;
        }
    }, []);

    const acquireStream = useCallback(async (deviceId?: string) => {
        if (streamRef.current && streamRef.current.getAudioTracks()[0]?.readyState === 'live') {
            return streamRef.current;
        }

        try {
            let effectiveDeviceId = deviceId;
            if (!effectiveDeviceId) {
                effectiveDeviceId = await findRealMicrophoneDevice();
            }

            const audioConstraints: MediaStreamConstraints['audio'] = effectiveDeviceId
                ? { deviceId: { exact: effectiveDeviceId } }
                : true;
            const newStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            setStream(newStream);
            streamRef.current = newStream;
            return newStream;
        } catch (error) {
            console.error('[useMicrophoneStream] Failed to acquire microphone:', error);
            throw error;
        }
    }, [findRealMicrophoneDevice]);

    const prepareStream = useCallback(async () => {
        if (!isEnabled) return;

        try {
            const stream = await acquireStream(selectedDeviceId);
            const track = stream.getAudioTracks()[0];
            console.log('[useMicrophoneStream] Stream prepared before connect', {
                selectedDeviceId,
                trackId: track?.id,
                trackLabel: track?.label,
                trackReadyState: track?.readyState,
                trackEnabled: track?.enabled,
                trackMuted: track?.muted,
            });
        } catch (error) {
            console.error('[useMicrophoneStream] Failed to prepare stream:', error);
            throw error;
        }
    }, [isEnabled, acquireStream, selectedDeviceId]);

    const releaseStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = undefined;
            setStream(undefined);
        }
    }, []);

    const updateAudioDevices = useCallback(async () => {
        try {
            if (!streamRef.current) {
                const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                permissionStream.getTracks().forEach(t => t.stop());
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');

            const realDevices = audioInputs.filter(
                device =>
                    !device.label.toLowerCase().includes('blackhole') &&
                    !device.label.toLowerCase().includes('virtual')
            );

            const devicesToShow = realDevices.length > 0 ? realDevices : audioInputs;
            setAudioDevices(devicesToShow);

            if (devicesToShow.length > 0 && !selectedDeviceId) {
                setSelectedDeviceId(devicesToShow[0].deviceId);
            }
        } catch (error) {
            console.error('[useMicrophoneStream] Failed to enumerate audio devices:', error);
        }
    }, [selectedDeviceId]);

    const mute = useCallback(async () => {
        if (!muteMicrophoneStream) {
            console.warn('[useMicrophoneStream] muteMicrophoneStream not available');
            return;
        }
        try {
            await muteMicrophoneStream();
            setIsMuted(true);
        } catch (error) {
            console.error('[useMicrophoneStream] Failed to mute:', error);
            throw error;
        }
    }, [muteMicrophoneStream]);

    const unmute = useCallback(async () => {
        if (!unmuteMicrophoneStream) {
            console.warn('[useMicrophoneStream] unmuteMicrophoneStream not available');
            return;
        }
        try {
            await unmuteMicrophoneStream();
            setIsMuted(false);
        } catch (error) {
            console.error('[useMicrophoneStream] Failed to unmute:', error);
            throw error;
        }
    }, [unmuteMicrophoneStream]);

    const publish = useCallback(async () => {
        if (!publishMicrophoneStream) {
            console.warn('[useMicrophoneStream] publishMicrophoneStream not available');
            return;
        }

        // Guard against double-publish race condition
        if (isPublishingRef.current) {
            console.log('[useMicrophoneStream] Already publishing, skipping');
            return;
        }
        isPublishingRef.current = true;

        try {
            let currentStream = streamRef.current;
            let track = currentStream?.getAudioTracks()[0];

            // Check if stream exists and track is still live
            if (!currentStream || !track || track.readyState === 'ended') {
                console.log('[useMicrophoneStream] Stream missing or track ended, acquiring fresh stream');
                streamRef.current = undefined;
                currentStream = await acquireStream(selectedDeviceId);
                track = currentStream.getAudioTracks()[0];
            }

            console.log('[useMicrophoneStream] Publishing stream', {
                streamId: currentStream.id,
                trackId: track?.id,
                trackLabel: track?.label,
                trackReadyState: track?.readyState,
                trackEnabled: track?.enabled,
                trackMuted: track?.muted,
            });

            await publishMicrophoneStream(currentStream);
            setIsPublished(true);
            setIsMuted(false);
        } catch (error) {
            console.error('[useMicrophoneStream] Failed to publish:', error);
            throw error;
        } finally {
            isPublishingRef.current = false;
        }
    }, [publishMicrophoneStream, acquireStream, selectedDeviceId]);

    const unpublish = useCallback(async () => {
        if (!unpublishMicrophoneStream) {
            console.warn('[useMicrophoneStream] unpublishMicrophoneStream not available');
            return;
        }

        try {
            await unpublishMicrophoneStream();
            setIsPublished(false);
            setIsMuted(false);
        } catch (error) {
            console.error('[useMicrophoneStream] Failed to unpublish:', error);
            throw error;
        }
    }, [unpublishMicrophoneStream]);

    // Toggle microphone (enable/disable from UI)
    const toggle = useCallback(
        async (enabled: boolean) => {
            setIsEnabled(enabled);

            // If not connected, just update the preference
            if (connectionState !== ConnectionState.Connected) {
                return;
            }

            if (enabled) {
                if (!isPublished) {
                    // First time enabling - publish
                    await publish();
                } else if (isMuted) {
                    // Already published but muted - unmute
                    await unmute();
                }
            } else {
                if (isPublished && !isMuted) {
                    // Mute (keep track alive for fast unmute)
                    await mute();
                }
            }
        },
        [connectionState, isPublished, isMuted, publish, unpublish, mute, unmute]
    );

    // Reset state on disconnect
    useEffect(() => {
        if (connectionState === ConnectionState.New || connectionState === ConnectionState.Disconnected) {
            setIsPublished(false);
            setIsMuted(false);
            // Release stream on disconnect
            releaseStream();
        }
    }, [connectionState, releaseStream]);

    // Auto-publish on connect if enabled
    useEffect(() => {
        if (
            connectionState === ConnectionState.Connected &&
            isEnabled &&
            microphoneSupported &&
            publishMicrophoneStream &&
            !isPublished
        ) {
            console.log('[useMicrophoneStream] Auto-publishing microphone...');
            publish().catch(error => {
                console.error('[useMicrophoneStream] Auto-publish failed:', error);
            });
        }
    }, [connectionState, isEnabled, microphoneSupported, publishMicrophoneStream, isPublished, publish]);

    useEffect(() => {
        if (isEnabled && microphoneSupported && streamRef.current) {
            updateAudioDevices();
        }
    }, [isEnabled, microphoneSupported, stream, updateAudioDevices]);

    useEffect(() => {
        return releaseStream;
    }, [releaseStream]);

    return {
        isEnabled,
        isPublished,
        isMuted,
        stream,
        audioDevices,
        selectedDeviceId,

        setSelectedDeviceId,
        toggle,
        mute,
        unmute,
        publish,
        unpublish,
        prepareStream, // Call before connect() to acquire stream early
    };
}
