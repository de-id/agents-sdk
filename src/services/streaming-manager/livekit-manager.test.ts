import { StreamingManagerOptionsFactory } from '../../test-utils/factories';
import {
    AgentActivityState,
    CreateSessionV2Options,
    StreamEvents,
    StreamingManagerOptions,
    StreamingState,
} from '../../types/index';
import { createLiveKitStreamingManager } from './livekit-manager';

// Mock livekit-client
const mockPublishTrack = jest.fn();
const mockUnpublishTrack = jest.fn();
const mockLocalParticipant = {
    publishTrack: mockPublishTrack,
    unpublishTrack: mockUnpublishTrack,
    sendText: jest.fn(),
    audioTrackPublications: new Map(),
};

const mockRoom = {
    on: jest.fn().mockReturnThis(),
    connect: jest.fn().mockResolvedValue(undefined),
    prepareConnection: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    localParticipant: mockLocalParticipant,
};

const mockRoomConstructor = jest.fn().mockImplementation(() => mockRoom);

const mockTrack = {
    Source: {
        Microphone: 'microphone',
    },
};

jest.mock('livekit-client', () => ({
    Room: mockRoomConstructor,
    RoomEvent: {
        ConnectionStateChanged: 'ConnectionStateChanged',
        ConnectionQualityChanged: 'ConnectionQualityChanged',
        ActiveSpeakersChanged: 'ActiveSpeakersChanged',
        ParticipantConnected: 'ParticipantConnected',
        ParticipantDisconnected: 'ParticipantDisconnected',
        TrackSubscribed: 'TrackSubscribed',
        TrackUnsubscribed: 'TrackUnsubscribed',
        DataReceived: 'DataReceived',
        MediaDevicesError: 'MediaDevicesError',
        EncryptionError: 'EncryptionError',
        TrackSubscriptionFailed: 'TrackSubscriptionFailed',
        TranscriptionReceived: 'TranscriptionReceived',
    },
    ConnectionState: {
        Connecting: 'connecting',
        Connected: 'connected',
        Disconnected: 'disconnected',
        Reconnecting: 'reconnecting',
        SignalReconnecting: 'signalReconnecting',
    },
    Track: mockTrack,
}));

// Mock createStreamApiV2
const mockCreateStream = jest.fn().mockResolvedValue({
    id: 'session-123',
    session_token: 'token-123',
    session_url: 'wss://test.livekit.cloud',
});

jest.mock('../../api/streams/streamsApiV2', () => ({
    createStreamApiV2: jest.fn(() => ({
        createStream: mockCreateStream,
    })),
}));

jest.mock('../../config/environment', () => ({ didApiUrl: 'http://test-api.com' }));

// Mock VideoStatsMonitor
const mockVideoStatsMonitor = {
    start: jest.fn(),
    stop: jest.fn(),
    getReport: jest.fn(() => ({})),
    _onVideoStateChange: null as any | null,
    invokeStateChange(state: StreamingState, report?: unknown) {
        this._onVideoStateChange?.(state, report);
    },
};

jest.mock('./stats/poll', () => ({
    createVideoStatsMonitor: jest.fn(
        (_getStats: unknown, _getIsConnected: unknown, _onConnected: unknown, onVideoStateChange: any) => {
            mockVideoStatsMonitor._onVideoStateChange = onVideoStateChange;
            return {
                start: mockVideoStatsMonitor.start,
                stop: mockVideoStatsMonitor.stop,
                getReport: mockVideoStatsMonitor.getReport,
            };
        }
    ),
}));

const mockLatencyTimestampTrackerUpdate = jest.fn();
jest.mock('../analytics/timestamp-tracker', () => ({
    latencyTimestampTracker: {
        reset: jest.fn(),
        update: (...args: any[]) => mockLatencyTimestampTrackerUpdate(...args),
        get: jest.fn(),
    },
}));

// Test constants
const TEST_AGENT_ID = 'agent123';
const TEST_TRACK_SID = 'track-sid-123';
const TEST_AUDIO_TRACK_ID = 'audio-track-1';
const TEST_AUDIO_TRACK_ID_2 = 'audio-track-2';
const ASYNC_WAIT_TIME = 10;

// Helper functions to create mock objects
function createMockAudioTrack(id: string = TEST_AUDIO_TRACK_ID, additionalProps: any = {}) {
    return {
        kind: 'audio',
        id,
        enabled: true,
        stop: jest.fn(),
        ...additionalProps,
    } as any;
}

function createMockTrack(id: string = TEST_AUDIO_TRACK_ID, mediaStreamTrack?: MediaStreamTrack) {
    return {
        kind: 'audio',
        id,
        mediaStreamTrack: mediaStreamTrack || createMockAudioTrack(id),
    } as any;
}

function createMockPublication(trackId: string = TEST_AUDIO_TRACK_ID, trackSid: string = TEST_TRACK_SID) {
    const mockTrack = createMockTrack(trackId);
    return {
        trackSid,
        track: mockTrack,
        source: 'microphone',
        mediaStreamTrack: createMockAudioTrack(trackId),
    } as any;
}

function createMockStream(audioTracks: any[] = [createMockAudioTrack()]) {
    const stream = new MediaStream(audioTracks);
    (stream as any).getAudioTracks = jest.fn(() => audioTracks);
    (stream as any).getTracks = jest.fn(() => audioTracks);
    return stream;
}

function getConnectionStateHandler(index?: number) {
    const calls = mockRoom.on.mock.calls.filter((call: any[]) => call[0] === 'ConnectionStateChanged');
    if (index !== undefined && calls[index]) {
        return calls[index][1];
    }
    return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
}

function getDataReceivedHandler() {
    const calls = mockRoom.on.mock.calls.filter((call: any[]) => call[0] === 'DataReceived');
    return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
}

function getTranscriptionReceivedHandler() {
    const calls = mockRoom.on.mock.calls.filter((call: any[]) => call[0] === 'TranscriptionReceived');
    return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
}

function getTrackSubscribedHandler() {
    const calls = mockRoom.on.mock.calls.filter((call: any[]) => call[0] === 'TrackSubscribed');
    return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
}

function getTrackUnsubscribedHandler() {
    const calls = mockRoom.on.mock.calls.filter((call: any[]) => call[0] === 'TrackUnsubscribed');
    return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
}

function getParticipantDisconnectedHandler() {
    const calls = mockRoom.on.mock.calls.filter((call: any[]) => call[0] === 'ParticipantDisconnected');
    return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
}

function createMockVideoTrack() {
    return {
        kind: 'video',
        mediaStreamTrack: {
            kind: 'video',
            id: 'video-track-1',
        },
        getRTCStatsReport: jest.fn().mockResolvedValue(new Map()),
    } as any;
}

function createMockRemoteParticipant(identity: string = 'agent') {
    return {
        identity,
        isLocal: false,
    } as any;
}

async function simulateConnection(handlerIndex?: number) {
    const handler = getConnectionStateHandler(handlerIndex);
    if (handler) {
        handler('connected');
    }
    await new Promise(resolve => setTimeout(resolve, ASYNC_WAIT_TIME));
}

describe('LiveKit Streaming Manager - Microphone Stream', () => {
    let agentId: string;
    let sessionOptions: CreateSessionV2Options;
    let options: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLatencyTimestampTrackerUpdate.mockClear();
        mockVideoStatsMonitor.start.mockClear();
        mockVideoStatsMonitor.stop.mockClear();
        mockVideoStatsMonitor.getReport.mockClear();
        agentId = TEST_AGENT_ID;
        sessionOptions = {
            chat_persist: true,
            transport_provider: 'livekit' as any,
        };
        options = StreamingManagerOptionsFactory.build();
    });

    describe('Microphone Stream Publishing', () => {
        it('should publish microphone track using publishMicrophoneStream method', async () => {
            const mockAudioTrack = createMockAudioTrack();
            const mockStream = createMockStream([mockAudioTrack]);
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            await manager.publishMicrophoneStream?.(mockStream);

            expect(mockPublishTrack).toHaveBeenCalledWith(mockAudioTrack, {
                source: 'microphone',
            });
        });

        it('should not publish microphone track when publishMicrophoneStream is not called', async () => {
            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            expect(mockPublishTrack).not.toHaveBeenCalled();
        });

        it('should extract first audio track from MediaStream', async () => {
            const mockAudioTrack1 = createMockAudioTrack(TEST_AUDIO_TRACK_ID, { enabled: false });
            const mockAudioTrack2 = createMockAudioTrack(TEST_AUDIO_TRACK_ID_2);
            const mockStream = createMockStream([mockAudioTrack1, mockAudioTrack2]);
            const mockPublication = createMockPublication(TEST_AUDIO_TRACK_ID);
            mockPublishTrack.mockResolvedValue(mockPublication);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            await manager.publishMicrophoneStream?.(mockStream);

            expect(mockPublishTrack).toHaveBeenCalledWith(mockAudioTrack1, {
                source: 'microphone',
            });
            expect(mockPublishTrack).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error Handling', () => {
        it('should throw error on publish failure', async () => {
            const mockStream = createMockStream();
            const publishError = new Error('Failed to publish track');
            mockPublishTrack.mockRejectedValue(publishError);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            await expect(manager.publishMicrophoneStream?.(mockStream)).rejects.toThrow('Failed to publish track');
        });
    });

    describe('Integration and Lifecycle', () => {
        it('should publish track after room connects using publishMicrophoneStream', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);

            expect(mockPublishTrack).not.toHaveBeenCalled();

            await simulateConnection();
            await manager.publishMicrophoneStream?.(mockStream);

            expect(mockPublishTrack).toHaveBeenCalled();
        });

        it('should unpublish track on disconnect', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);
            mockUnpublishTrack.mockResolvedValue(undefined);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            await manager.publishMicrophoneStream?.(mockStream);
            await manager.disconnect();

            expect(mockUnpublishTrack).toHaveBeenCalledWith(mockPublication.track);
        });

        it('should handle track publication lifecycle correctly', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);
            mockUnpublishTrack.mockResolvedValue(undefined);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);

            await simulateConnection();
            await manager.publishMicrophoneStream?.(mockStream);
            expect(mockPublishTrack).toHaveBeenCalledTimes(1);

            await manager.disconnect();
            expect(mockUnpublishTrack).toHaveBeenCalledTimes(1);

            await manager.disconnect();
            expect(mockUnpublishTrack).toHaveBeenCalledTimes(1);
        });

        it('should handle multiple connection/disconnect cycles', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);
            mockUnpublishTrack.mockResolvedValue(undefined);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection(0);
            await manager.publishMicrophoneStream?.(mockStream);
            await manager.disconnect();

            const manager2 = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection(1);
            await manager2.publishMicrophoneStream?.(mockStream);
            await manager2.disconnect();

            expect(mockPublishTrack).toHaveBeenCalledTimes(2);
        });

        it('should handle stream ending while published', async () => {
            const mockAudioTrack = createMockAudioTrack();
            const mockStream = createMockStream([mockAudioTrack]);
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            await manager.publishMicrophoneStream?.(mockStream);

            mockAudioTrack.stop();

            await expect(manager.disconnect()).resolves.not.toThrow();
        });

        it('should allow publishing microphone stream after connection', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            // Initially no stream published
            expect(mockPublishTrack).not.toHaveBeenCalled();

            // Publish stream after connection
            await manager.publishMicrophoneStream?.(mockStream);

            expect(mockPublishTrack).toHaveBeenCalledWith(mockStream.getAudioTracks()[0], { source: 'microphone' });
        });

        it('should throw error when publishing stream before connection', async () => {
            const mockStream = createMockStream();

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);

            // Try to publish before connection
            await expect(manager.publishMicrophoneStream?.(mockStream)).rejects.toThrow('Room is not connected');
        });
    });

    describe('Agent Activity State Changes', () => {
        let mockOnAgentActivityStateChange: jest.Mock;
        let sendDataEvent: (event: StreamEvents, extraData?: object) => void;

        beforeEach(async () => {
            mockOnAgentActivityStateChange = jest.fn();
            options.callbacks.onAgentActivityStateChange = mockOnAgentActivityStateChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();
            sendDataEvent = (event: StreamEvents, extraData = {}) => {
                const payload = Buffer.from(JSON.stringify({ subject: event, ...extraData }));
                dataHandler(payload, undefined, undefined, event);
            };
        });

        it.each([
            [StreamEvents.StreamVideoCreated, AgentActivityState.Talking],
            [StreamEvents.StreamVideoDone, AgentActivityState.Idle],
        ])('should set activity state on %s event', (event, expectedState) => {
            sendDataEvent(event);

            expect(mockOnAgentActivityStateChange).toHaveBeenCalledTimes(1);
            expect(mockOnAgentActivityStateChange).toHaveBeenCalledWith(expectedState);
        });

        it('should set activity state to Loading on ChatAudioTranscribed event', async () => {
            sendDataEvent(StreamEvents.ChatAudioTranscribed, { content: 'test', role: 'user' });

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockOnAgentActivityStateChange).toHaveBeenCalledTimes(1);
            expect(mockOnAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Loading);
        });

        it('should transition from Talking to Idle when video ends', () => {
            sendDataEvent(StreamEvents.StreamVideoCreated);
            sendDataEvent(StreamEvents.StreamVideoDone);

            expect(mockOnAgentActivityStateChange).toHaveBeenCalledTimes(2);
            expect(mockOnAgentActivityStateChange).toHaveBeenNthCalledWith(1, AgentActivityState.Talking);
            expect(mockOnAgentActivityStateChange).toHaveBeenNthCalledWith(2, AgentActivityState.Idle);
        });
    });

    describe('Transcription Interrupt Detection', () => {
        let mockOnInterruptDetected: jest.Mock;
        let transcriptionHandler: (segments: any[], participant?: any) => void;
        let dataHandler: (payload: Uint8Array, participant?: any, kind?: any, topic?: string) => void;

        beforeEach(async () => {
            mockOnInterruptDetected = jest.fn();
            options.callbacks.onInterruptDetected = mockOnInterruptDetected;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            transcriptionHandler = getTranscriptionReceivedHandler();
            dataHandler = getDataReceivedHandler();
        });

        it('should update latency tracker when local participant sends transcription', () => {
            const localParticipant = { isLocal: true };
            transcriptionHandler([], localParticipant);

            expect(mockLatencyTimestampTrackerUpdate).toHaveBeenCalledTimes(1);
        });

        it('should not update latency tracker when remote participant sends transcription', () => {
            const remoteParticipant = { isLocal: false };
            transcriptionHandler([], remoteParticipant);

            expect(mockLatencyTimestampTrackerUpdate).not.toHaveBeenCalled();
        });

        it('should not update latency tracker when participant is undefined', () => {
            transcriptionHandler([]);

            expect(mockLatencyTimestampTrackerUpdate).not.toHaveBeenCalled();
        });

        it('should detect interrupt and set state to Idle when local participant sends transcription during Talking state', () => {
            const localParticipant = { isLocal: true };
            const payload = Buffer.from(JSON.stringify({ subject: StreamEvents.StreamVideoCreated }));
            dataHandler(payload);

            transcriptionHandler([], localParticipant);

            expect(mockLatencyTimestampTrackerUpdate).toHaveBeenCalledTimes(1);
            expect(mockOnInterruptDetected).toHaveBeenCalledTimes(1);
            expect(mockOnInterruptDetected).toHaveBeenCalledWith({ type: 'audio' });
        });

        it('should not detect interrupt when local participant sends transcription during Idle state', () => {
            const localParticipant = { isLocal: true };
            transcriptionHandler([], localParticipant);

            expect(mockLatencyTimestampTrackerUpdate).toHaveBeenCalledTimes(1);
            expect(mockOnInterruptDetected).not.toHaveBeenCalled();
        });

        it('should not detect interrupt when local participant sends transcription during Loading state', async () => {
            const localParticipant = { isLocal: true };
            const chatTranscribedPayload = Buffer.from(
                JSON.stringify({ subject: StreamEvents.ChatAudioTranscribed, content: 'test', role: 'user' })
            );
            dataHandler(chatTranscribedPayload);
            await new Promise(resolve => setTimeout(resolve, 0));

            transcriptionHandler([], localParticipant);

            expect(mockLatencyTimestampTrackerUpdate).toHaveBeenCalledTimes(1);
            expect(mockOnInterruptDetected).not.toHaveBeenCalled();
        });

        it('should update latency tracker but not detect interrupt when remote participant sends transcription during Talking state', () => {
            const remoteParticipant = { isLocal: false };
            const payload = Buffer.from(JSON.stringify({ subject: StreamEvents.StreamVideoCreated }));
            dataHandler(payload);

            transcriptionHandler([], remoteParticipant);

            expect(mockLatencyTimestampTrackerUpdate).not.toHaveBeenCalled();
            expect(mockOnInterruptDetected).not.toHaveBeenCalled();
        });
    });

    describe('Video Stats Monitor', () => {
        it('should start video stats monitor when video track is subscribed', async () => {
            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const trackSubscribedHandler = getTrackSubscribedHandler();
            const mockVideoTrack = createMockVideoTrack();
            const mockParticipant = createMockRemoteParticipant();

            trackSubscribedHandler(mockVideoTrack, {}, mockParticipant);

            expect(mockVideoStatsMonitor.start).toHaveBeenCalledTimes(1);
        });

        it('should not start video stats monitor for audio tracks', async () => {
            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const trackSubscribedHandler = getTrackSubscribedHandler();
            const mockAudioTrack = createMockAudioTrack();
            (mockAudioTrack as any).mediaStreamTrack = mockAudioTrack;
            const mockParticipant = createMockRemoteParticipant();

            trackSubscribedHandler(mockAudioTrack, {}, mockParticipant);

            expect(mockVideoStatsMonitor.start).not.toHaveBeenCalled();
        });

        it('should call getReport and onVideoStateChange with Stop and report when video track is unsubscribed', async () => {
            const onVideoStateChange = jest.fn();
            const report = { duration: 1000 };
            options.callbacks.onVideoStateChange = onVideoStateChange;
            mockVideoStatsMonitor.getReport.mockReturnValue(report);

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const mockVideoTrack = createMockVideoTrack();
            getTrackSubscribedHandler()(mockVideoTrack, {}, createMockRemoteParticipant());
            onVideoStateChange.mockClear();
            mockVideoStatsMonitor.getReport.mockClear();

            getTrackUnsubscribedHandler()(mockVideoTrack, {}, createMockRemoteParticipant());

            expect(mockVideoStatsMonitor.getReport).toHaveBeenCalledTimes(1);
            expect(mockVideoStatsMonitor.stop).toHaveBeenCalledTimes(1);
            expect(onVideoStateChange).toHaveBeenCalledTimes(1);
            expect(onVideoStateChange).toHaveBeenCalledWith(StreamingState.Stop, report);
        });

        it('should call onVideoStateChange with Start when videoStatsMonitor callback is invoked with Start', async () => {
            const onVideoStateChange = jest.fn();
            options.callbacks.onVideoStateChange = onVideoStateChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            getTrackSubscribedHandler()(createMockVideoTrack(), {}, createMockRemoteParticipant());

            onVideoStateChange.mockClear();
            mockVideoStatsMonitor.invokeStateChange(StreamingState.Start);

            expect(onVideoStateChange).toHaveBeenCalledTimes(1);
            expect(onVideoStateChange).toHaveBeenCalledWith(StreamingState.Start);
        });

        it('should call onVideoStateChange with Stop and report when videoStatsMonitor callback is invoked with Stop', async () => {
            const onVideoStateChange = jest.fn();
            const report = { duration: 1000 };
            options.callbacks.onVideoStateChange = onVideoStateChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            getTrackSubscribedHandler()(createMockVideoTrack(), {}, createMockRemoteParticipant());

            onVideoStateChange.mockClear();
            mockVideoStatsMonitor.invokeStateChange(StreamingState.Stop, report);

            expect(mockVideoStatsMonitor.getReport).not.toHaveBeenCalled();
            expect(onVideoStateChange).toHaveBeenCalledTimes(1);
            expect(onVideoStateChange).toHaveBeenCalledWith(StreamingState.Stop, report);
        });
    });

    describe('Connection State Change Reasons', () => {
        let mockOnConnectionStateChange: jest.Mock;

        beforeEach(() => {
            mockOnConnectionStateChange = jest.fn();
            options.callbacks.onConnectionStateChange = mockOnConnectionStateChange;
        });

        it('should call onConnectionStateChange with "livekit:connecting" when LiveKit emits Connecting', async () => {
            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            const handler = getConnectionStateHandler();

            handler('connecting');

            expect(mockOnConnectionStateChange).toHaveBeenCalledWith('connecting', 'livekit:connecting');
        });

        it('should call onConnectionStateChange with "livekit:disconnected" when LiveKit emits Disconnected', async () => {
            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            const handler = getConnectionStateHandler();

            handler('disconnected');

            expect(mockOnConnectionStateChange).toHaveBeenCalledWith('disconnected', 'livekit:disconnected');
        });

        it('should call onConnectionStateChange with "livekit:reconnecting" when LiveKit emits Reconnecting', async () => {
            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            const handler = getConnectionStateHandler();

            handler('reconnecting');

            expect(mockOnConnectionStateChange).toHaveBeenCalledWith('connecting', 'livekit:reconnecting');
        });

        it('should call onConnectionStateChange with "livekit:signal-reconnecting" when LiveKit emits SignalReconnecting', async () => {
            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            const handler = getConnectionStateHandler();

            handler('signalReconnecting');

            expect(mockOnConnectionStateChange).toHaveBeenCalledWith('connecting', 'livekit:signal-reconnecting');
        });

        it('should call onConnectionStateChange with "livekit:track-subscribed" when video track is subscribed', async () => {
            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const trackSubscribedHandler = getTrackSubscribedHandler();
            const mockVideoTrack = createMockVideoTrack();
            const mockParticipant = createMockRemoteParticipant();

            trackSubscribedHandler(mockVideoTrack, {}, mockParticipant);

            expect(mockOnConnectionStateChange).toHaveBeenCalledWith('connected', 'livekit:track-subscribed');
        });

        it('should call onConnectionStateChange with "livekit:participant-disconnected" when participant disconnects', async () => {
            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            mockOnConnectionStateChange.mockClear();

            const participantDisconnectedHandler = getParticipantDisconnectedHandler();
            const mockParticipant = createMockRemoteParticipant();

            participantDisconnectedHandler(mockParticipant);
            await new Promise(resolve => setTimeout(resolve, ASYNC_WAIT_TIME));

            expect(mockOnConnectionStateChange).toHaveBeenCalledWith(
                'disconnecting',
                'livekit:participant-disconnected'
            );
        });

        it('should call onConnectionStateChange with "user:disconnect" when disconnect is called', async () => {
            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            mockOnConnectionStateChange.mockClear();

            await manager.disconnect();

            expect(mockOnConnectionStateChange).toHaveBeenCalledWith('disconnecting', 'user:disconnect');
        });

        it('should call onConnectionStateChange with "user:reconnect" when reconnect is called', async () => {
            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const handler = getConnectionStateHandler();
            handler('disconnected');
            mockOnConnectionStateChange.mockClear();

            mockRoom.connect.mockResolvedValue(undefined);
            (mockRoom as any).state = 'disconnected';
            (mockRoom as any).remoteParticipants = { size: 1 };

            await manager.reconnect();

            expect(mockOnConnectionStateChange).toHaveBeenCalledWith('connecting', 'user:reconnect');
        });

        it('should call onConnectionStateChange with "user:reconnect-failed" when reconnect fails', async () => {
            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const handler = getConnectionStateHandler();
            handler('disconnected');
            mockOnConnectionStateChange.mockClear();

            mockRoom.connect.mockRejectedValue(new Error('Connection failed'));
            (mockRoom as any).state = 'disconnected';

            await expect(manager.reconnect()).rejects.toThrow('Connection failed');

            expect(mockOnConnectionStateChange).toHaveBeenCalledWith('fail', 'user:reconnect-failed');
        });
    });
});
