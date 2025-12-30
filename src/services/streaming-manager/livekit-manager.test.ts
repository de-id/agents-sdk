/**
 * Tests for LiveKit streaming manager
 * Tests microphone stream publishing functionality
 */

import { StreamingManagerOptionsFactory } from '../../test-utils/factories';
import { CreateSessionV2Options, StreamingManagerOptions } from '../../types/index';
import { createLiveKitStreamingManager } from './livekit-manager';

// Mock livekit-client
const mockPublishTrack = jest.fn();
const mockUnpublishTrack = jest.fn();
const mockLocalParticipant = {
    publishTrack: mockPublishTrack,
    unpublishTrack: mockUnpublishTrack,
    sendText: jest.fn(),
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
        TrackSubscribed: 'TrackSubscribed',
        TrackUnsubscribed: 'TrackUnsubscribed',
        DataReceived: 'DataReceived',
        MediaDevicesError: 'MediaDevicesError',
        EncryptionError: 'EncryptionError',
        TrackSubscriptionFailed: 'TrackSubscriptionFailed',
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

// Test constants
const TEST_AGENT_ID = 'agent123';
const TEST_TRACK_SID = 'track-sid-123';
const TEST_AUDIO_TRACK_ID = 'audio-track-1';
const TEST_AUDIO_TRACK_ID_2 = 'audio-track-2';
const TEST_SESSION_ID = 'session-123';
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

function createMockTrack(id: string = TEST_AUDIO_TRACK_ID) {
    return {
        kind: 'audio',
        id,
    } as any;
}

function createMockPublication(trackId: string = TEST_AUDIO_TRACK_ID, trackSid: string = TEST_TRACK_SID) {
    return {
        trackSid,
        track: createMockTrack(trackId),
    };
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
        agentId = TEST_AGENT_ID;
        sessionOptions = {
            chat_persist: true,
            transport_provider: 'livekit' as any,
        };
        options = StreamingManagerOptionsFactory.build();
    });

    describe('Microphone Stream Publishing', () => {
        it('should publish microphone track when microphoneStream is provided', async () => {
            const mockAudioTrack = createMockAudioTrack();
            const mockStream = createMockStream([mockAudioTrack]);
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            options.microphoneStream = mockStream;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            expect(mockPublishTrack).toHaveBeenCalledWith(mockAudioTrack, {
                source: 'microphone',
            });
        });

        it('should not publish microphone track when microphoneStream is not provided', async () => {
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

            options.microphoneStream = mockStream;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            expect(mockPublishTrack).toHaveBeenCalledWith(mockAudioTrack1, {
                source: 'microphone',
            });
            expect(mockPublishTrack).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error Handling', () => {
        it('should log error and call onError callback on publish failure', async () => {
            const mockStream = createMockStream();
            const publishError = new Error('Failed to publish track');
            mockPublishTrack.mockRejectedValue(publishError);

            options.microphoneStream = mockStream;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            expect(options.callbacks.onError).toHaveBeenCalledWith(
                publishError,
                expect.objectContaining({ sessionId: TEST_SESSION_ID })
            );
        });
    });

    describe('Integration and Lifecycle', () => {
        it('should publish track after room connects', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            options.microphoneStream = mockStream;

            await createLiveKitStreamingManager(agentId, sessionOptions, options);

            expect(mockPublishTrack).not.toHaveBeenCalled();

            await simulateConnection();

            expect(mockPublishTrack).toHaveBeenCalled();
        });

        it('should unpublish track on disconnect', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);
            mockUnpublishTrack.mockResolvedValue(undefined);

            options.microphoneStream = mockStream;

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();
            await manager.disconnect();

            expect(mockUnpublishTrack).toHaveBeenCalledWith(mockPublication.track);
        });

        it('should handle track publication lifecycle correctly', async () => {
            const mockStream = createMockStream();
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);
            mockUnpublishTrack.mockResolvedValue(undefined);

            options.microphoneStream = mockStream;

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);

            await simulateConnection();
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

            options.microphoneStream = mockStream;

            // First cycle
            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection(0);
            await manager.disconnect();

            // Second cycle - need to create new manager
            const manager2 = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection(1);
            await manager2.disconnect();

            expect(mockPublishTrack).toHaveBeenCalledTimes(2);
        });

        it('should handle stream ending while published', async () => {
            const mockAudioTrack = createMockAudioTrack();
            const mockStream = createMockStream([mockAudioTrack]);
            const mockPublication = createMockPublication();
            mockPublishTrack.mockResolvedValue(mockPublication);

            options.microphoneStream = mockStream;

            const manager = await createLiveKitStreamingManager(agentId, sessionOptions, options);
            await simulateConnection();

            mockAudioTrack.stop();

            await expect(manager.disconnect()).resolves.not.toThrow();
        });
    });
});
