import { StreamingManagerOptionsFactory } from '../../test-utils/factories';
import {
    AgentActivityState,
    CreateSessionV2Options,
    StreamEvents,
    StreamingManagerOptions,
    StreamingState,
    TransportProvider,
} from '../../types/index';
import { createLiveKitStreamingManager, DataChannelTopic } from './livekit-manager';

// Mock livekit-client
const mockPublishTrack = jest.fn();
const mockUnpublishTrack = jest.fn();
const mockLocalParticipant = {
    publishTrack: mockPublishTrack,
    unpublishTrack: mockUnpublishTrack,
    sendText: jest.fn(),
    audioTrackPublications: new Map(),
    videoTrackPublications: new Map(),
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
        Camera: 'camera',
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
    createAudioStatsDetector: jest.fn(() => ({
        arm: jest.fn(),
        destroy: jest.fn(),
    })),
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
const TEST_VIDEO_TRACK_ID = 'video-track-1';
const TEST_VIDEO_TRACK_ID_2 = 'video-track-2';
const TEST_CAMERA_TRACK_SID = 'camera-track-sid-123';
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
    const track: any = {
        kind: 'audio',
        id,
        mediaStreamTrack: mediaStreamTrack || createMockAudioTrack(id),
    };
    track.replaceTrack = jest.fn().mockResolvedValue(track);
    return track;
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

function createMockCameraTrack(id: string = TEST_VIDEO_TRACK_ID, additionalProps: any = {}) {
    return {
        kind: 'video',
        id,
        enabled: true,
        stop: jest.fn(),
        ...additionalProps,
    } as any;
}

function createMockCameraPublication(trackId: string = TEST_VIDEO_TRACK_ID, trackSid: string = TEST_CAMERA_TRACK_SID) {
    const track = {
        kind: 'video',
        id: trackId,
        mediaStreamTrack: createMockCameraTrack(trackId),
    } as any;
    return {
        trackSid,
        track,
        source: 'camera',
    } as any;
}

function createMockCameraStream(videoTracks: any[] = [createMockCameraTrack()]) {
    const stream = new MediaStream(videoTracks);
    (stream as any).getVideoTracks = jest.fn(() => videoTracks);
    (stream as any).getTracks = jest.fn(() => videoTracks);
    return stream;
}

function getConnectionStateHandler(index?: number) {
    const calls = mockRoom.on.mock.calls.filter((call: any[]) => call[0] === 'ConnectionStateChanged');
    if (index !== undefined && calls[index]) {
        return calls[index][1];
    }
    return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
}

function createDataChannelPayload(data: any): Uint8Array {
    return Buffer.from(JSON.stringify(data));
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
        mockLocalParticipant.audioTrackPublications = new Map();
        mockLocalParticipant.videoTrackPublications = new Map();
        agentId = TEST_AGENT_ID;
        sessionOptions = {
            chat_persist: true,
            transport: {
                provider: TransportProvider.Livekit,
            },
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

    describe('STT Language Switching', () => {
        it('should send did.stt-language message with the language payload', async () => {
            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            await manager.setSttLanguage?.('French');

            expect(mockLocalParticipant.sendText).toHaveBeenCalledWith(JSON.stringify({ language: 'French' }), {
                topic: DataChannelTopic.SttLanguage,
            });
        });

        it('should not send did.stt-language message before the room connects', async () => {
            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);

            await manager.setSttLanguage?.('French');

            expect(mockLocalParticipant.sendText).not.toHaveBeenCalled();
            expect(options.callbacks.onError).toHaveBeenCalled();
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

            expect(mockUnpublishTrack).toHaveBeenCalledWith(mockPublication.track, false);
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

    describe('Microphone Stream Replacement', () => {
        it('should throw when room is not connected', async () => {
            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            const newTrack = createMockAudioTrack(TEST_AUDIO_TRACK_ID_2);

            await expect(manager.replaceMicrophoneTrack?.(newTrack)).rejects.toThrow('Room is not connected');
        });

        it('should throw when there is no microphone publication', async () => {
            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            const newTrack = createMockAudioTrack(TEST_AUDIO_TRACK_ID_2);

            await expect(manager.replaceMicrophoneTrack?.(newTrack)).rejects.toThrow(
                'No microphone publication to replace'
            );
        });

        it('should throw when given a non-audio track', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            await manager.publishMicrophoneStream?.(mockStream);

            const videoTrack = createMockCameraTrack();

            await expect(manager.replaceMicrophoneTrack?.(videoTrack)).rejects.toThrow(
                'Microphone track must be an audio track'
            );
            expect(mockPublication.track.replaceTrack).not.toHaveBeenCalled();
        });

        it('should throw when a publish is already in progress', async () => {
            const mockStream = createMockStream();
            let resolvePublish: (value: any) => void;
            const slowPublish = new Promise(resolve => {
                resolvePublish = resolve;
            });
            mockPublishTrack.mockReturnValue(slowPublish);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const publishPromise = manager.publishMicrophoneStream?.(mockStream);
            const newTrack = createMockAudioTrack(TEST_AUDIO_TRACK_ID_2);

            await expect(manager.replaceMicrophoneTrack?.(newTrack)).rejects.toThrow('Microphone publish in progress');

            resolvePublish!(createMockPublication());
            await publishPromise;
        });

        it('should call publication.track.replaceTrack and not unpublish/publish', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);
            mockUnpublishTrack.mockResolvedValue(undefined);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            await manager.publishMicrophoneStream?.(mockStream);

            const newTrack = createMockAudioTrack(TEST_AUDIO_TRACK_ID_2);
            mockPublishTrack.mockClear();
            mockUnpublishTrack.mockClear();

            await manager.replaceMicrophoneTrack?.(newTrack);

            expect(mockPublication.track.replaceTrack).toHaveBeenCalledTimes(1);
            expect(mockPublication.track.replaceTrack).toHaveBeenCalledWith(newTrack);
            expect(mockUnpublishTrack).not.toHaveBeenCalled();
            expect(mockPublishTrack).not.toHaveBeenCalled();

            // Verify the SDK still holds the original publication reference:
            // disconnect should unpublish *that exact* publication's track.
            await manager.disconnect();
            expect(mockUnpublishTrack).toHaveBeenCalledTimes(1);
            expect(mockUnpublishTrack).toHaveBeenCalledWith(mockPublication.track, false);
        });

        it('should throw "No microphone publication to replace" after an explicit unpublish', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);
            mockUnpublishTrack.mockResolvedValue(undefined);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            await manager.publishMicrophoneStream?.(mockStream);
            await manager.unpublishMicrophoneStream?.();

            const newTrack = createMockAudioTrack(TEST_AUDIO_TRACK_ID_2);

            await expect(manager.replaceMicrophoneTrack?.(newTrack)).rejects.toThrow(
                'No microphone publication to replace'
            );
            expect(mockPublication.track.replaceTrack).not.toHaveBeenCalled();
        });

        it('should reset isPublishing after replaceTrack rejects, allowing a subsequent replace', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            await manager.publishMicrophoneStream?.(mockStream);

            const replaceSpy = mockPublication.track.replaceTrack as jest.Mock;
            replaceSpy.mockRejectedValueOnce(new Error('replace failed'));

            const failingTrack = createMockAudioTrack(TEST_AUDIO_TRACK_ID_2);
            await expect(manager.replaceMicrophoneTrack?.(failingTrack)).rejects.toThrow('replace failed');

            // Subsequent call must not be blocked by a leaked isPublishing flag.
            const followupTrack = createMockAudioTrack('audio-track-3');
            await expect(manager.replaceMicrophoneTrack?.(followupTrack)).resolves.toBeUndefined();
            expect(replaceSpy).toHaveBeenLastCalledWith(followupTrack);
            expect(replaceSpy).toHaveBeenCalledTimes(2);
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

        it('should set Talking on stream-video/created event', () => {
            sendDataEvent(StreamEvents.StreamVideoCreated);

            expect(mockOnAgentActivityStateChange).toHaveBeenCalledTimes(1);
            expect(mockOnAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Talking);
        });

        it('should set activity state to Loading on ChatAudioTranscribed event', async () => {
            sendDataEvent(StreamEvents.ChatAudioTranscribed, { content: 'test', role: 'user' });

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockOnAgentActivityStateChange).toHaveBeenCalledTimes(1);
            expect(mockOnAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Loading);
        });

        it('should return to ToolActive when video ends while a tool call is pending', () => {
            sendDataEvent(StreamEvents.ToolCallStarted, { call_id: 'tc1', name: 'form' });
            sendDataEvent(StreamEvents.StreamVideoCreated);
            sendDataEvent(StreamEvents.StreamVideoDone);

            expect(mockOnAgentActivityStateChange).toHaveBeenNthCalledWith(1, AgentActivityState.ToolActive);
            expect(mockOnAgentActivityStateChange).toHaveBeenNthCalledWith(2, AgentActivityState.Talking);
            expect(mockOnAgentActivityStateChange).toHaveBeenNthCalledWith(3, AgentActivityState.ToolActive);
        });

        it('should set Loading on turn/started', () => {
            sendDataEvent(StreamEvents.TurnStarted, { turn_id: 1 });

            expect(mockOnAgentActivityStateChange).toHaveBeenLastCalledWith(AgentActivityState.Loading);
        });

        it('should return to Idle only on turn/ended, not on a mid-turn video done', () => {
            sendDataEvent(StreamEvents.TurnStarted, { turn_id: 1 });
            sendDataEvent(StreamEvents.StreamVideoCreated, { turn_id: 1 });
            sendDataEvent(StreamEvents.StreamVideoDone, { turn_id: 1 });
            sendDataEvent(StreamEvents.TurnEnded, { turn_id: 1 });

            const states = mockOnAgentActivityStateChange.mock.calls.map(call => call[0]);
            expect(states).toEqual([AgentActivityState.Loading, AgentActivityState.Talking, AgentActivityState.Idle]);
        });

        it('should stay ToolActive when the last tool call resolves inside a turn', () => {
            sendDataEvent(StreamEvents.TurnStarted, { turn_id: 1 });
            sendDataEvent(StreamEvents.ToolCallStarted, { call_id: 'tc1', name: 'form', turn_id: 1 });
            sendDataEvent(StreamEvents.ToolCallDone, { call_id: 'tc1', name: 'form', turn_id: 1 });

            expect(mockOnAgentActivityStateChange).not.toHaveBeenCalledWith(AgentActivityState.Idle);
            expect(mockOnAgentActivityStateChange).toHaveBeenLastCalledWith(AgentActivityState.ToolActive);
        });

        it('should drop a stale turn/ended from an older turn', () => {
            sendDataEvent(StreamEvents.TurnStarted, { turn_id: 1 });
            sendDataEvent(StreamEvents.TurnEnded, { turn_id: 1 });
            sendDataEvent(StreamEvents.TurnStarted, { turn_id: 2 });
            mockOnAgentActivityStateChange.mockClear();

            sendDataEvent(StreamEvents.TurnEnded, { turn_id: 1 });

            expect(mockOnAgentActivityStateChange).not.toHaveBeenCalled();
        });
    });

    describe('Transcription Interrupt Detection', () => {
        let transcriptionHandler: (segments: any[], participant?: any) => void;
        let dataHandler: (payload: Uint8Array, participant?: any, kind?: any, topic?: string) => void;

        beforeEach(async () => {
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
        });

        it('should not detect interrupt when local participant sends transcription during Idle state', () => {
            const localParticipant = { isLocal: true };
            transcriptionHandler([], localParticipant);

            expect(mockLatencyTimestampTrackerUpdate).toHaveBeenCalledTimes(1);
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
        });

        it('should update latency tracker but not detect interrupt when remote participant sends transcription during Talking state', () => {
            const remoteParticipant = { isLocal: false };
            const payload = Buffer.from(JSON.stringify({ subject: StreamEvents.StreamVideoCreated }));
            dataHandler(payload);

            transcriptionHandler([], remoteParticipant);

            expect(mockLatencyTimestampTrackerUpdate).not.toHaveBeenCalled();
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
            mockVideoStatsMonitor.invokeStateChange(StreamingState.Start);
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
            mockVideoStatsMonitor.invokeStateChange(StreamingState.Start);

            onVideoStateChange.mockClear();
            mockVideoStatsMonitor.invokeStateChange(StreamingState.Stop, report);

            expect(mockVideoStatsMonitor.getReport).not.toHaveBeenCalled();
            expect(onVideoStateChange).toHaveBeenCalledTimes(1);
            expect(onVideoStateChange).toHaveBeenCalledWith(StreamingState.Stop, report);
        });

        it('should not call onVideoStateChange(Stop) twice when monitor Stop and track unsubscribed both occur', async () => {
            const onVideoStateChange = jest.fn();
            const report = { duration: 1000 };
            options.callbacks.onVideoStateChange = onVideoStateChange;
            mockVideoStatsMonitor.getReport.mockReturnValue(report);

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const mockVideoTrack = createMockVideoTrack();
            getTrackSubscribedHandler()(mockVideoTrack, {}, createMockRemoteParticipant());
            mockVideoStatsMonitor.invokeStateChange(StreamingState.Start);
            onVideoStateChange.mockClear();

            mockVideoStatsMonitor.invokeStateChange(StreamingState.Stop, report);
            getTrackUnsubscribedHandler()(mockVideoTrack, {}, createMockRemoteParticipant());

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

describe('LiveKit Streaming Manager - Camera Stream', () => {
    let agentId: string;
    let sessionOptions: CreateSessionV2Options;
    let options: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRoom.connect.mockResolvedValue(undefined);
        mockRoom.prepareConnection.mockResolvedValue(undefined);
        mockRoom.disconnect.mockResolvedValue(undefined);
        mockRoom.on.mockReturnThis();
        mockLocalParticipant.audioTrackPublications = new Map();
        mockLocalParticipant.videoTrackPublications = new Map();
        agentId = TEST_AGENT_ID;
        sessionOptions = {
            chat_persist: true,
            transport: {
                provider: TransportProvider.Livekit,
            },
        };
        options = StreamingManagerOptionsFactory.build();
    });

    describe('Camera Stream Publishing', () => {
        it('should publish camera track using publishCameraStream', async () => {
            // ARRANGE:
            const mockVideoTrack = createMockCameraTrack();
            const mockStream = createMockCameraStream([mockVideoTrack]);
            const mockPublication = createMockCameraPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            // ACT:
            await manager.publishCameraStream?.(mockStream);

            // ASSERT:
            expect(mockPublishTrack).toHaveBeenCalledWith(mockVideoTrack, {
                source: 'camera',
            });
        });

        it('should throw error when no video track in stream', async () => {
            // ARRANGE:
            const emptyStream = createMockCameraStream([]);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            // ACT + ASSERT:
            await expect(manager.publishCameraStream?.(emptyStream)).rejects.toThrow(
                'No camera track found in the provided MediaStream'
            );
        });

        it('should throw error when publishing camera before connection', async () => {
            // ARRANGE:
            const mockStream = createMockCameraStream();

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);

            // ACT + ASSERT:
            await expect(manager.publishCameraStream?.(mockStream)).rejects.toThrow('Room is not connected');
        });

        it('should throw error on camera publish failure', async () => {
            // ARRANGE:
            const mockStream = createMockCameraStream();
            mockPublishTrack.mockRejectedValue(new Error('Failed to publish camera'));

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            // ACT + ASSERT:
            await expect(manager.publishCameraStream?.(mockStream)).rejects.toThrow('Failed to publish camera');
        });

        it('should skip when same camera track is already published', async () => {
            // ARRANGE:
            const mockVideoTrack = createMockCameraTrack();
            const mockStream = createMockCameraStream([mockVideoTrack]);
            const mockPublication = createMockCameraPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            mockLocalParticipant.videoTrackPublications.set('pub-1', {
                source: 'camera',
                track: { mediaStreamTrack: mockVideoTrack },
            });

            // ACT:
            await manager.publishCameraStream?.(mockStream);

            // ASSERT:
            expect(mockPublishTrack).not.toHaveBeenCalled();
        });

        it('should unpublish existing camera track before publishing a different one', async () => {
            // ARRANGE:
            const firstTrack = createMockCameraTrack(TEST_VIDEO_TRACK_ID);
            const firstStream = createMockCameraStream([firstTrack]);
            const firstPublication = createMockCameraPublication(TEST_VIDEO_TRACK_ID);
            mockPublishTrack.mockResolvedValue(firstPublication);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            await manager.publishCameraStream?.(firstStream);

            const secondTrack = createMockCameraTrack(TEST_VIDEO_TRACK_ID_2);
            const secondStream = createMockCameraStream([secondTrack]);
            const secondPublication = createMockCameraPublication(TEST_VIDEO_TRACK_ID_2);
            mockPublishTrack.mockResolvedValue(secondPublication);

            // ACT:
            await manager.publishCameraStream?.(secondStream);

            // ASSERT:
            expect(mockUnpublishTrack).toHaveBeenCalledWith(firstPublication.track, false);
            expect(mockPublishTrack).toHaveBeenCalledTimes(2);
            expect(mockPublishTrack).toHaveBeenLastCalledWith(secondTrack, { source: 'camera' });
        });
    });

    describe('Camera Unpublish', () => {
        it('should unpublish camera track on disconnect', async () => {
            // ARRANGE:
            const mockStream = createMockCameraStream();
            const mockPublication = createMockCameraPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);
            mockUnpublishTrack.mockResolvedValue(undefined);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            await manager.publishCameraStream?.(mockStream);

            // ACT:
            await manager.disconnect();

            // ASSERT:
            expect(mockUnpublishTrack).toHaveBeenCalledWith(mockPublication.track, false);
        });

        it('should not fail when unpublishing camera without prior publish', async () => {
            // ARRANGE:
            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            // ACT:
            await manager.unpublishCameraStream?.();

            // ASSERT:
            expect(mockUnpublishTrack).not.toHaveBeenCalled();
        });

        it('should handle explicit unpublish via unpublishCameraStream', async () => {
            // ARRANGE:
            const mockStream = createMockCameraStream();
            const mockPublication = createMockCameraPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);
            mockUnpublishTrack.mockResolvedValue(undefined);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            await manager.publishCameraStream?.(mockStream);

            // ACT:
            await manager.unpublishCameraStream?.();

            // ASSERT:
            expect(mockUnpublishTrack).toHaveBeenCalledWith(mockPublication.track, false);
        });
    });

    describe('Concurrent Publish Guard', () => {
        it('should skip camera publish when already in progress', async () => {
            // ARRANGE:
            const mockStream = createMockCameraStream();
            let resolvePublish: (value: any) => void;
            const slowPublish = new Promise(resolve => {
                resolvePublish = resolve;
            });
            mockPublishTrack.mockReturnValue(slowPublish);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            // ACT:
            const firstPublish = manager.publishCameraStream?.(mockStream);
            const secondPublish = manager.publishCameraStream?.(mockStream);

            resolvePublish!(createMockCameraPublication());
            await firstPublish;
            await secondPublish;

            // ASSERT:
            expect(mockPublishTrack).toHaveBeenCalledTimes(1);
        });

        it('should skip microphone publish when already in progress', async () => {
            // ARRANGE:
            const mockStream = createMockStream();
            let resolvePublish: (value: any) => void;
            const slowPublish = new Promise(resolve => {
                resolvePublish = resolve;
            });
            mockPublishTrack.mockReturnValue(slowPublish);

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            // ACT:
            const firstPublish = manager.publishMicrophoneStream?.(mockStream);
            const secondPublish = manager.publishMicrophoneStream?.(mockStream);

            resolvePublish!(createMockPublication());
            await firstPublish;
            await secondPublish;

            // ASSERT:
            expect(mockPublishTrack).toHaveBeenCalledTimes(1);
        });
    });
});

describe('LiveKit Streaming Manager - Disconnect Behavior', () => {
    let agentId: string;
    let sessionOptions: CreateSessionV2Options;
    let options: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRoom.connect.mockResolvedValue(undefined);
        mockRoom.prepareConnection.mockResolvedValue(undefined);
        mockRoom.disconnect.mockResolvedValue(undefined);
        mockRoom.on.mockReturnThis();
        mockLocalParticipant.audioTrackPublications = new Map();
        mockLocalParticipant.videoTrackPublications = new Map();
        agentId = TEST_AGENT_ID;
        sessionOptions = {
            chat_persist: true,
            transport: {
                provider: TransportProvider.Livekit,
            },
        };
        options = StreamingManagerOptionsFactory.build();
    });

    it('should unpublish both mic and camera on disconnect', async () => {
        // ARRANGE:
        const micStream = createMockStream();
        const micPub = createMockPublication();
        const camStream = createMockCameraStream();
        const camPub = createMockCameraPublication();
        mockPublishTrack.mockResolvedValueOnce(micPub).mockResolvedValueOnce(camPub);
        mockUnpublishTrack.mockResolvedValue(undefined);

        const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
        await simulateConnection();
        await manager.publishMicrophoneStream?.(micStream);
        await manager.publishCameraStream?.(camStream);

        // ACT:
        await manager.disconnect();

        // ASSERT:
        expect(mockUnpublishTrack).toHaveBeenCalledWith(micPub.track, false);
        expect(mockUnpublishTrack).toHaveBeenCalledWith(camPub.track, false);
    });

    it('should allow re-publishing camera after disconnect and reconnect', async () => {
        // ARRANGE:
        const camStream = createMockCameraStream();
        const camPub = createMockCameraPublication();
        mockPublishTrack.mockResolvedValue(camPub);
        mockUnpublishTrack.mockResolvedValue(undefined);

        const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
        await simulateConnection(0);
        await manager.publishCameraStream?.(camStream);
        await manager.disconnect();

        // ACT:
        const manager2 = await createLiveKitStreamingManager(agentId, sessionOptions, options);
        await simulateConnection(1);
        await manager2.publishCameraStream?.(camStream);

        // ASSERT:
        expect(mockPublishTrack).toHaveBeenCalledTimes(2);
    });

    it('should null out publication refs on unexpected disconnect via connection state handler', async () => {
        // ARRANGE:
        const micStream = createMockStream();
        const micPub = createMockPublication();
        const camStream = createMockCameraStream();
        const camPub = createMockCameraPublication();
        mockPublishTrack.mockResolvedValueOnce(micPub).mockResolvedValueOnce(camPub);
        mockUnpublishTrack.mockResolvedValue(undefined);

        const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
        await simulateConnection();
        await manager.publishMicrophoneStream?.(micStream);
        await manager.publishCameraStream?.(camStream);
        mockUnpublishTrack.mockClear();

        // ACT:
        const handler = getConnectionStateHandler();
        handler('disconnected');

        // After unexpected disconnect, calling disconnect again should NOT
        // try to unpublish (publications were already nulled)
        await manager.disconnect();

        // ASSERT:
        expect(mockUnpublishTrack).not.toHaveBeenCalled();
    });
});

describe('LiveKit Streaming Manager - Verbose Mode', () => {
    let agentId: string;
    let sessionOptions: CreateSessionV2Options;
    let options: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRoom.connect.mockResolvedValue(undefined);
        mockRoom.prepareConnection.mockResolvedValue(undefined);
        mockRoom.disconnect.mockResolvedValue(undefined);
        mockRoom.on.mockReturnThis();
        mockLocalParticipant.audioTrackPublications = new Map();
        mockLocalParticipant.videoTrackPublications = new Map();
        agentId = TEST_AGENT_ID;
        sessionOptions = {
            chat_persist: true,
            transport: {
                provider: TransportProvider.Livekit,
            },
        };
        options = StreamingManagerOptionsFactory.build();
        mockCreateStream.mockResolvedValue({
            id: 'session-123',
            session_token: 'token-123',
            session_url: 'wss://test.livekit.cloud',
            interrupt_enabled: true,
        });
    });

    it('sends verbose in the createStream request when options.verbose is true', async () => {
        const optionsWithVerbose = { ...options, verbose: true };
        await createLiveKitStreamingManager(agentId, sessionOptions, optionsWithVerbose);

        expect(mockCreateStream).toHaveBeenCalledWith(expect.objectContaining({ verbose: true }));
    });

    it('defaults verbose to false in the createStream request', async () => {
        await createLiveKitStreamingManager(agentId, sessionOptions, options);

        expect(mockCreateStream).toHaveBeenCalledWith(expect.objectContaining({ verbose: false }));
    });
});

describe('LiveKit Streaming Manager - Tool Events and Activity State', () => {
    let agentId: string;
    let sessionOptions: CreateSessionV2Options;
    let options: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRoom.connect.mockResolvedValue(undefined);
        mockRoom.prepareConnection.mockResolvedValue(undefined);
        mockRoom.disconnect.mockResolvedValue(undefined);
        mockRoom.on.mockReturnThis();
        mockLocalParticipant.audioTrackPublications = new Map();
        mockLocalParticipant.videoTrackPublications = new Map();
        agentId = TEST_AGENT_ID;
        sessionOptions = {
            chat_persist: true,
            transport: {
                provider: TransportProvider.Livekit,
            },
        };
        options = StreamingManagerOptionsFactory.build();
    });

    describe('Enum values', () => {
        it('should have correct AgentActivityState enum value for ToolActive', () => {
            // ASSERT:
            expect(AgentActivityState.ToolActive).toBe('TOOL_ACTIVE');
        });
    });

    describe('handleDataReceived - tool-call/started', () => {
        it('should transition to ToolActive and forward payload via onToolEvent on tool-call/started', async () => {
            // ARRANGE:
            const onAgentActivityStateChange = jest.fn();
            const onToolEvent = jest.fn();
            options.callbacks.onAgentActivityStateChange = onAgentActivityStateChange;
            options.callbacks.onToolEvent = onToolEvent;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();
            const payload = createDataChannelPayload({
                subject: StreamEvents.ToolCallStarted,
                call_id: 'call-123',
                name: 'get_weather',
                input: { location: 'Tel Aviv' },
                output: {},
                interruptible: true,
                timestamp: new Date().toISOString(),
            });

            // ACT:
            dataHandler(payload);

            // ASSERT:
            expect(onAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.ToolActive);
            expect(onToolEvent).toHaveBeenCalledWith(
                StreamEvents.ToolCallStarted,
                expect.objectContaining({
                    call_id: 'call-123',
                    name: 'get_weather',
                    input: { location: 'Tel Aviv' },
                })
            );
        });

        it('should emit onInterruptibleChange(false) when tool-call/started carries interruptible: false', async () => {
            // ARRANGE:
            const onInterruptibleChange = jest.fn();
            options.callbacks.onInterruptibleChange = onInterruptibleChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();
            const payload = createDataChannelPayload({
                subject: StreamEvents.ToolCallStarted,
                call_id: 'call-123',
                name: 'get_weather',
                input: {},
                output: {},
                interruptible: false,
                timestamp: new Date().toISOString(),
            });

            // ACT:
            dataHandler(payload);

            // ASSERT:
            expect(onInterruptibleChange).toHaveBeenCalledWith(false);
        });

        it('should not emit onInterruptibleChange when an interruptible tool-call/started leaves the aggregate unchanged', async () => {
            // ARRANGE:
            const onInterruptibleChange = jest.fn();
            options.callbacks.onInterruptibleChange = onInterruptibleChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();
            const payload = createDataChannelPayload({
                subject: StreamEvents.ToolCallStarted,
                call_id: 'call-123',
                name: 'get_weather',
                input: {},
                output: {},
                interruptible: true,
                timestamp: new Date().toISOString(),
            });

            // ACT:
            dataHandler(payload);

            // ASSERT: the manager starts interruptible, so this is not a change
            expect(onInterruptibleChange).not.toHaveBeenCalled();
        });

        it('should emit onInterruptibleChange(true) on tool-call/done when the last blocking call resolves', async () => {
            // ARRANGE:
            const onInterruptibleChange = jest.fn();
            options.callbacks.onInterruptibleChange = onInterruptibleChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();

            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallStarted,
                    call_id: 'call-123',
                    name: 'get_weather',
                    input: {},
                    output: {},
                    interruptible: false,
                    timestamp: new Date().toISOString(),
                })
            );

            onInterruptibleChange.mockClear();

            // ACT:
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallDone,
                    call_id: 'call-123',
                    name: 'get_weather',
                    input: {},
                    output: {},
                    duration_ms: 50,
                    extra: {},
                    timestamp: new Date().toISOString(),
                })
            );

            // ASSERT: the pending map is now empty, which is interruptible
            expect(onInterruptibleChange).toHaveBeenCalledWith(true);
        });
    });

    describe('handleDataReceived - interruptible across parallel tool calls', () => {
        let onInterruptibleChange: jest.Mock;
        let dataHandler: any;

        const emitToolStarted = ({ call_id, interruptible }: { call_id: string; interruptible: boolean }) =>
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallStarted,
                    call_id,
                    name: 'tool',
                    input: {},
                    output: {},
                    interruptible,
                    timestamp: new Date().toISOString(),
                })
            );

        const emitToolDone = ({ call_id }: { call_id: string }) =>
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallDone,
                    call_id,
                    name: 'tool',
                    input: {},
                    output: {},
                    duration_ms: 50,
                    extra: {},
                    timestamp: new Date().toISOString(),
                })
            );

        const emitStreamVideoCreated = (metadata?: { interruptible: boolean }) =>
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.StreamVideoCreated,
                    metadata,
                })
            );

        const emitStreamVideoDone = (metadata?: { interruptible: boolean }) =>
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.StreamVideoDone,
                    metadata,
                })
            );

        // The manager starts interruptible and only calls back on a change, so with no calls
        // yet the observed state is the initial true.
        const lastInterruptible = () =>
            onInterruptibleChange.mock.calls.length > 0
                ? onInterruptibleChange.mock.calls[onInterruptibleChange.mock.calls.length - 1][0]
                : true;

        beforeEach(async () => {
            onInterruptibleChange = jest.fn();
            options.callbacks.onInterruptibleChange = onInterruptibleChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            dataHandler = getDataReceivedHandler();
        });

        it('stays non-interruptible while any blocking call is pending', () => {
            emitToolStarted({ call_id: 'a', interruptible: true });
            emitToolStarted({ call_id: 'b', interruptible: false });

            expect(lastInterruptible()).toBe(false);
        });

        it('becomes interruptible once the blocking call resolves', () => {
            emitToolStarted({ call_id: 'a', interruptible: true });
            emitToolStarted({ call_id: 'b', interruptible: false });
            emitToolDone({ call_id: 'b' });

            expect(lastInterruptible()).toBe(true);
        });

        it('does not regress interruptibility when a blocking call starts after an async one', () => {
            emitToolStarted({ call_id: 'a', interruptible: true });
            expect(lastInterruptible()).toBe(true);
            emitToolStarted({ call_id: 'b', interruptible: false });
            expect(lastInterruptible()).toBe(false);
        });

        it('stays non-interruptible when a video activity event arrives while a blocking call is pending', () => {
            emitToolStarted({ call_id: 'a', interruptible: false });
            emitStreamVideoDone();

            expect(lastInterruptible()).toBe(false);
        });

        it('becomes non-interruptible while a speech marked interruptible: false is playing', () => {
            emitStreamVideoCreated({ interruptible: false });

            expect(lastInterruptible()).toBe(false);
        });

        it('is interruptible while only an async call is pending after a non-interruptible speech', () => {
            emitStreamVideoCreated({ interruptible: false });
            emitStreamVideoDone({ interruptible: false });
            emitToolStarted({ call_id: 'a', interruptible: true });

            expect(lastInterruptible()).toBe(true);
        });

        it('becomes interruptible again once the speech and every pending call allow it', () => {
            emitStreamVideoCreated({ interruptible: false });
            expect(lastInterruptible()).toBe(false);

            emitToolStarted({ call_id: 'a', interruptible: true });
            expect(lastInterruptible()).toBe(false);

            emitStreamVideoDone({ interruptible: false });
            expect(lastInterruptible()).toBe(true);
        });

        it('stays non-interruptible after the speech ends while a blocking call is pending', () => {
            emitStreamVideoCreated({ interruptible: false });
            emitToolStarted({ call_id: 'a', interruptible: false });
            emitStreamVideoDone({ interruptible: false });

            expect(lastInterruptible()).toBe(false);
        });
    });

    describe('handleDataReceived - blocking-mode tool calls', () => {
        let onBlockingToolPendingChange: jest.Mock;
        let onInterruptibleChange: jest.Mock;
        let dataHandler: any;

        const emitToolStarted = ({
            call_id,
            interruptible,
            execution_mode,
        }: {
            call_id: string;
            interruptible: boolean;
            execution_mode?: string;
        }) =>
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallStarted,
                    call_id,
                    name: 'tool',
                    input: {},
                    output: {},
                    interruptible,
                    ...(execution_mode ? { execution_mode } : {}),
                    timestamp: new Date().toISOString(),
                })
            );

        const emitToolDone = ({ call_id }: { call_id: string }) =>
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallDone,
                    call_id,
                    name: 'tool',
                    input: {},
                    output: {},
                    duration_ms: 50,
                    extra: {},
                    timestamp: new Date().toISOString(),
                })
            );

        const emitStreamVideoCreated = (metadata?: { interruptible: boolean }) =>
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.StreamVideoCreated,
                    metadata,
                })
            );

        // Nothing is pending at start, so with no callback yet the observed state is the initial false.
        const lastBlockingToolPending = () =>
            onBlockingToolPendingChange.mock.calls.length > 0
                ? onBlockingToolPendingChange.mock.calls[onBlockingToolPendingChange.mock.calls.length - 1][0]
                : false;

        beforeEach(async () => {
            onBlockingToolPendingChange = jest.fn();
            onInterruptibleChange = jest.fn();
            options.callbacks.onBlockingToolPendingChange = onBlockingToolPendingChange;
            options.callbacks.onInterruptibleChange = onInterruptibleChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            dataHandler = getDataReceivedHandler();
        });

        it('emits true while a blocking-mode call is pending and false once it resolves', () => {
            emitToolStarted({ call_id: 'a', interruptible: false, execution_mode: 'blocking' });
            expect(lastBlockingToolPending()).toBe(true);

            emitToolDone({ call_id: 'a' });
            expect(lastBlockingToolPending()).toBe(false);
        });

        it('never fires for an async-mode call', () => {
            emitToolStarted({ call_id: 'a', interruptible: true, execution_mode: 'async' });

            expect(onBlockingToolPendingChange).not.toHaveBeenCalled();
        });

        it('treats a missing execution_mode as blocking', () => {
            emitToolStarted({ call_id: 'a', interruptible: false });

            expect(lastBlockingToolPending()).toBe(true);
        });

        it('stays true while any blocking call is pending and drops only when the last one resolves', () => {
            emitToolStarted({ call_id: 'a', interruptible: true, execution_mode: 'async' });
            emitToolStarted({ call_id: 'b', interruptible: false, execution_mode: 'blocking' });
            emitToolStarted({ call_id: 'c', interruptible: false, execution_mode: 'blocking' });
            expect(lastBlockingToolPending()).toBe(true);

            emitToolDone({ call_id: 'b' });
            expect(lastBlockingToolPending()).toBe(true);

            emitToolDone({ call_id: 'c' });
            expect(lastBlockingToolPending()).toBe(false);
        });

        it('fires only on an actual change, not once per event', () => {
            emitToolStarted({ call_id: 'a', interruptible: false, execution_mode: 'blocking' });
            emitToolStarted({ call_id: 'b', interruptible: false, execution_mode: 'blocking' });

            expect(onBlockingToolPendingChange).toHaveBeenCalledTimes(1);
            expect(onBlockingToolPendingChange).toHaveBeenCalledWith(true);
        });

        // The whole point of the split: a non-interruptible speech is not a blocking tool.
        it('ignores speech interruptibility', () => {
            emitStreamVideoCreated({ interruptible: false });

            expect(onInterruptibleChange).toHaveBeenCalledWith(false);
            expect(onBlockingToolPendingChange).not.toHaveBeenCalled();
        });

        it('reports an async call as not blocking even while the speech is non-interruptible', () => {
            emitStreamVideoCreated({ interruptible: false });
            emitToolStarted({ call_id: 'a', interruptible: true, execution_mode: 'async' });

            expect(lastBlockingToolPending()).toBe(false);
        });
    });

    describe('handleDataReceived - tool-call/done', () => {
        it('should forward payload via onToolEvent without changing activity state', async () => {
            // ARRANGE:
            const onAgentActivityStateChange = jest.fn();
            const onToolEvent = jest.fn();
            options.callbacks.onAgentActivityStateChange = onAgentActivityStateChange;
            options.callbacks.onToolEvent = onToolEvent;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();

            // Set ToolActive first so we can verify done doesn't touch it
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallStarted,
                    call_id: 'call-123',
                    name: 'get_weather',
                    input: {},
                    output: {},
                    timestamp: new Date().toISOString(),
                })
            );
            onAgentActivityStateChange.mockClear();

            const donePayload = createDataChannelPayload({
                subject: StreamEvents.ToolCallDone,
                call_id: 'call-123',
                name: 'get_weather',
                input: {},
                output: { temp: 22 },
                duration_ms: 500,
                extra: {},
                timestamp: new Date().toISOString(),
            });

            // ACT:
            dataHandler(donePayload);

            // ASSERT:
            expect(onAgentActivityStateChange).not.toHaveBeenCalled();
            expect(onToolEvent).toHaveBeenCalledWith(
                StreamEvents.ToolCallDone,
                expect.objectContaining({
                    call_id: 'call-123',
                    output: { temp: 22 },
                    duration_ms: 500,
                })
            );
        });
    });

    describe('handleDataReceived - tool-call/error', () => {
        it('should forward payload via onToolEvent without changing activity state', async () => {
            // ARRANGE:
            const onAgentActivityStateChange = jest.fn();
            const onToolEvent = jest.fn();
            options.callbacks.onAgentActivityStateChange = onAgentActivityStateChange;
            options.callbacks.onToolEvent = onToolEvent;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();

            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallStarted,
                    call_id: 'call-123',
                    name: 'get_weather',
                    input: {},
                    output: {},
                    timestamp: new Date().toISOString(),
                })
            );
            onAgentActivityStateChange.mockClear();

            const errorPayload = createDataChannelPayload({
                subject: StreamEvents.ToolCallError,
                call_id: 'call-123',
                name: 'get_weather',
                input: {},
                output: {},
                duration_ms: 120,
                extra: { message: 'upstream timeout' },
                timestamp: new Date().toISOString(),
            });

            // ACT:
            dataHandler(errorPayload);

            // ASSERT:
            expect(onAgentActivityStateChange).not.toHaveBeenCalled();
            expect(onToolEvent).toHaveBeenCalledWith(
                StreamEvents.ToolCallError,
                expect.objectContaining({
                    call_id: 'call-123',
                    extra: { message: 'upstream timeout' },
                })
            );
        });
    });

    describe('handleDataReceived - stream-video/done with interruptible', () => {
        it('should stay ToolActive on stream-video/done while a tool call is pending (interruptible true)', async () => {
            // ARRANGE:
            const onAgentActivityStateChange = jest.fn();
            options.callbacks.onAgentActivityStateChange = onAgentActivityStateChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();

            // Set ToolActive state first
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallStarted,
                    call_id: 'call-123',
                    name: 'test',
                    input: {},
                    output: {},
                    timestamp: new Date().toISOString(),
                })
            );
            onAgentActivityStateChange.mockClear();

            const streamVideoDonePayload = createDataChannelPayload({
                subject: StreamEvents.StreamVideoDone,
                metadata: { interruptible: true },
            });

            // ACT:
            dataHandler(streamVideoDonePayload);

            // ASSERT:
            expect(onAgentActivityStateChange).not.toHaveBeenCalled();
        });

        it('should stay ToolActive on stream-video/done while a tool call is pending (interruptible absent)', async () => {
            // ARRANGE:
            const onAgentActivityStateChange = jest.fn();
            options.callbacks.onAgentActivityStateChange = onAgentActivityStateChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();

            // Set ToolActive state first
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallStarted,
                    call_id: 'call-123',
                    name: 'test',
                    input: {},
                    output: {},
                    timestamp: new Date().toISOString(),
                })
            );
            onAgentActivityStateChange.mockClear();

            const streamVideoDonePayload = createDataChannelPayload({
                subject: StreamEvents.StreamVideoDone,
            });

            // ACT:
            dataHandler(streamVideoDonePayload);

            // ASSERT:
            expect(onAgentActivityStateChange).not.toHaveBeenCalled();
        });

        it('should stay in ToolActive on stream-video/done when interruptible is false', async () => {
            // ARRANGE:
            const onAgentActivityStateChange = jest.fn();
            options.callbacks.onAgentActivityStateChange = onAgentActivityStateChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();

            // Set ToolActive state first
            dataHandler(
                createDataChannelPayload({
                    subject: StreamEvents.ToolCallStarted,
                    call_id: 'call-123',
                    name: 'test',
                    input: {},
                    output: {},
                    timestamp: new Date().toISOString(),
                })
            );
            onAgentActivityStateChange.mockClear();

            const streamVideoDonePayload = createDataChannelPayload({
                subject: StreamEvents.StreamVideoDone,
                metadata: { interruptible: false },
            });

            // ACT:
            dataHandler(streamVideoDonePayload);

            // ASSERT:
            expect(onAgentActivityStateChange).not.toHaveBeenCalled();
        });
    });

    describe('Chained tools', () => {
        it('should not emit Idle as chained tool calls resolve', async () => {
            // ARRANGE:
            const onAgentActivityStateChange = jest.fn();
            options.callbacks.onAgentActivityStateChange = onAgentActivityStateChange;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            const dataHandler = getDataReceivedHandler();

            const toolEvent = (subject: StreamEvents, callId: string) =>
                createDataChannelPayload({
                    subject,
                    call_id: callId,
                    name: 'tool',
                    input: {},
                    output: {},
                    timestamp: new Date().toISOString(),
                });

            // ACT: two parallel tool calls resolve; idle is driven by turn/ended, not tool resolution
            dataHandler(toolEvent(StreamEvents.ToolCallStarted, 'call-1'));
            dataHandler(toolEvent(StreamEvents.ToolCallStarted, 'call-2'));
            dataHandler(toolEvent(StreamEvents.ToolCallDone, 'call-1'));
            dataHandler(toolEvent(StreamEvents.ToolCallDone, 'call-2'));

            // ASSERT: resolving tool calls never drives Idle
            expect(onAgentActivityStateChange).not.toHaveBeenCalledWith(AgentActivityState.Idle);
        });
    });

    describe('No regression - sessions without tools', () => {
        it('should forward stream-video/done via onMessage without emitting Idle', async () => {
            // ARRANGE:
            const onAgentActivityStateChange = jest.fn();
            const onMessage = jest.fn();
            options.callbacks.onAgentActivityStateChange = onAgentActivityStateChange;
            options.callbacks.onMessage = onMessage;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            const dataHandler = getDataReceivedHandler();

            // Regular session without any tool events
            const payload = createDataChannelPayload({
                subject: StreamEvents.StreamVideoDone,
            });

            // ACT:
            dataHandler(payload);

            // ASSERT:
            expect(onAgentActivityStateChange).not.toHaveBeenCalledWith(AgentActivityState.Idle);
            expect(onMessage).toHaveBeenCalled();
        });
    });
});
