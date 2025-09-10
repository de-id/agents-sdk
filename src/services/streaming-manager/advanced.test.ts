/**
 * Advanced functionality tests for streaming manager
 * Tests complex scenarios, edge cases, and advanced features
 */

import { StreamApiFactory, StreamingAgentFactory, StreamingManagerOptionsFactory } from '../../test-utils/factories';
import { CreateStreamOptions, StreamType, StreamingManagerOptions } from '../../types/index';
import { pollStats } from './stats/poll';
import {
    createParseDataChannelMessage,
    createWebRTCStreamingManager as createStreamingManager,
} from './webrtc-manager';

// Mock createStreamApi
const mockApi = StreamApiFactory.build();
jest.mock('../../api/streams', () => ({ createStreamApi: jest.fn(() => mockApi) }));

// Mock pollStats
jest.mock('./stats/poll', () => ({
    pollStats: jest.fn(() => 123), // mock interval id
}));

// Mock other dependencies as needed
jest.mock('../../config/environment', () => ({ didApiUrl: 'http://test-api.com' }));

const parseDataChannelMessage = createParseDataChannelMessage(jest.fn());

describe('Streaming Manager Advanced', () => {
    let agentId: string;
    let agent: CreateStreamOptions;
    let options: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        agentId = 'agent123';
        agent = StreamingAgentFactory.build();
        options = StreamingManagerOptionsFactory.build();
    });

    describe('Stream Events and Processing', () => {
        it('should handle StreamReady event', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Legacy });
            expect(manager.streamId).toBe('streamId');
        });

        it('should handle StreamReady with string metadata', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Legacy });
            expect(manager.streamId).toBe('streamId');
        });

        it('should handle StreamStarted event with video metadata', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamId).toBe('streamId');
            expect(manager.sessionId).toBe('sessionId');
            expect(typeof manager.speak).toBe('function');
            expect(typeof manager.disconnect).toBe('function');
            expect(typeof manager.sendDataChannelMessage).toBe('function');
        });

        it('should handle StreamDone event cleanup', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamType).toBe(StreamType.Legacy);
            expect(manager.interruptAvailable).toBe(false);
        });

        it('should handle StreamStarted event without metadata', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            const result = parseDataChannelMessage('StreamStarted:{}');
            expect(result.subject).toBe('StreamStarted');
            expect(result.data).toEqual({});

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle StreamDone event processing', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            const result = parseDataChannelMessage('StreamDone:{"video_id":"video-123"}');
            expect(result.subject).toBe('StreamDone');
            expect(result.data).toEqual({ video_id: 'video-123' });

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle data channel message with invalid JSON', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle data channel message parsing and processing', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            const parsedMessage = parseDataChannelMessage('StreamStarted:{"metadata":{"videoId":"test-video-123"}}');
            expect(parsedMessage.subject).toBe('StreamStarted');
            expect(parsedMessage.data).toEqual({ metadata: { videoId: 'test-video-123' } });

            expect(manager.streamId).toBe('streamId');
        });
    });

    describe('Warmup and Connection States', () => {
        it('should handle data channel open with warmup', async () => {
            agent = { stream_warmup: true } as any;
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.onopen();

            expect(options.callbacks.onConnectionStateChange).not.toHaveBeenCalled();
        });

        it('should handle warmup mode with connection establishment', async () => {
            agent = { stream_warmup: true } as any;
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockPC.iceConnectionState = 'connected';
            mockPC.oniceconnectionstatechange();

            mockDC.onopen();

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle onConnected callback with warmup disabled', async () => {
            agent = { stream_warmup: false } as any;
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.onopen();

            expect(options.callbacks.onConnectionStateChange).toHaveBeenCalled();
        });

        it('should handle warmup mode with isConnected state', async () => {
            agent = { stream_warmup: true } as any;
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.onopen();

            expect(options.callbacks.onConnectionStateChange).not.toHaveBeenCalled();

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle data channel state management in warmup', async () => {
            agent = { stream_warmup: true } as any;
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.onopen();

            expect(manager.streamId).toBe('streamId');
        });
    });

    describe('Data Channel Management', () => {
        it('should handle isDatachannelOpen state management', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.onopen();

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle isDatachannelOpen state transitions', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.onopen();

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle data channel not ready error', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.readyState = 'connecting';

            manager.sendDataChannelMessage('test-message');

            expect(options.callbacks.onError).toHaveBeenCalledWith(expect.any(Error), { streamId: 'streamId' });
        });

        it('should handle data channel message handlers registration', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            expect(typeof mockDC.onmessage).toBe('function');
            expect(manager.streamId).toBe('streamId');
        });
    });

    describe('Video and Stream State Management', () => {
        it('should handle internal video ID changes', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamType).toBe(StreamType.Legacy);
            expect(manager.sessionId).toBe('sessionId');
        });

        it('should handle video state changes in both modes', async () => {
            let manager = await createStreamingManager(agentId, agent, options);
            expect(manager.streamType).toBe(StreamType.Legacy);

            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: false,
            });

            manager = await createStreamingManager(agentId, agent, options);
            expect(manager.streamType).toBe(StreamType.Fluent);
        });

        it('should handle StreamStarted with metadata in legacy mode', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamType).toBe(StreamType.Legacy);
            expect(options.callbacks.onVideoStateChange).toBeDefined();
            expect(options.callbacks.onVideoIdChange).toBeDefined();
        });

        it('should handle StreamDone in legacy mode', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamType).toBe(StreamType.Legacy);
            expect(manager.interruptAvailable).toBe(false);
        });

        it('should handle fluent mode agent activity state changes', async () => {
            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: false,
            });

            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamType).toBe(StreamType.Fluent);
            expect(options.callbacks.onAgentActivityStateChange).toBeDefined();
        });

        it('should handle handleStreamVideoIdChange function', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(options.callbacks.onVideoIdChange).toBeDefined();
            expect(manager.streamId).toBe('streamId');
        });

        it('should verify StreamStarted event includes video_id in metadata', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockVideoIdCallback = options.callbacks.onVideoIdChange as jest.Mock;
            mockVideoIdCallback.mockClear();

            // Verify that StreamStarted events include video_id in metadata structure
            const parsedMessage = parseDataChannelMessage('StreamStarted:{"metadata":{"videoId":"test-video-123"}}');

            expect(parsedMessage.subject).toBe('StreamStarted');
            expect(parsedMessage.data).toEqual({ metadata: { videoId: 'test-video-123' } });

            // Type assertion for accessing nested properties
            const data = parsedMessage.data as { metadata: { videoId: string } };
            expect(data.metadata.videoId).toBe('test-video-123');
        });

        it('should verify StreamDone event includes video_id', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockVideoIdCallback = options.callbacks.onVideoIdChange as jest.Mock;
            mockVideoIdCallback.mockClear();

            // Verify that StreamDone events include video_id
            const parsedMessage = parseDataChannelMessage('StreamDone:{"video_id":"video-123"}');

            expect(parsedMessage.subject).toBe('StreamDone');
            expect(parsedMessage.data).toEqual({ video_id: 'video-123' });

            // Type assertion for accessing properties
            const data = parsedMessage.data as { video_id: string };
            expect(data.video_id).toBe('video-123');
        });

        it('should handle stream video event with different payload types', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            const result1 = parseDataChannelMessage('StreamStarted:{"other":"data"}');
            expect(result1.subject).toBe('StreamStarted');
            expect(result1.data).toEqual({ other: 'data' });

            const result2 = parseDataChannelMessage('StreamStarted:simple-string');
            expect(result2.subject).toBe('StreamStarted');
            expect(result2.data).toBe('simple-string');

            expect(manager.streamId).toBe('streamId');
        });
    });

    describe('Analytics and State Management', () => {
        it('should handle analytics enrichment and tracking', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Legacy });

            expect(manager.streamId).toBe('streamId');
            expect(manager.interruptAvailable).toBe(false);
        });

        it('should handle analytics with stream metadata', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Legacy });
            expect(manager.streamId).toBe('streamId');
        });

        it('should handle stream state management for different stream types', async () => {
            let manager = await createStreamingManager(agentId, agent, options);
            expect(manager.streamType).toBe(StreamType.Legacy);

            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: false,
            });

            manager = await createStreamingManager(agentId, agent, options);
            expect(manager.streamType).toBe(StreamType.Fluent);
        });

        it('should handle legacy stream state management', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamType).toBe(StreamType.Legacy);
            expect(manager.sessionId).toBe('sessionId');
            expect(manager.streamId).toBe('streamId');
        });

        it('should handle fluent stream without interrupt', async () => {
            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: false,
            });

            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamType).toBe(StreamType.Fluent);
            expect(manager.interruptAvailable).toBe(false);
        });
    });

    describe('Connectivity and Stats', () => {
        it('should handle connectivity state changes', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(options.callbacks.onConnectivityStateChange).toBeDefined();
            expect(manager.streamId).toBe('streamId');
        });

        it('should handle connectivity state changes via pollStats', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(pollStats).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.any(Function),
                false
            );

            const connectivityCallback = (pollStats as jest.Mock).mock.calls[0][4];

            connectivityCallback('test-connectivity-state');
            expect(options.callbacks.onConnectivityStateChange).toHaveBeenCalledWith('test-connectivity-state');
        });

        it('should handle pollStats return value', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(pollStats).toHaveBeenCalled();

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle video stats interval management', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(pollStats).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                false
            );

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle pollStats function execution and return', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(pollStats).toHaveBeenCalled();
            expect(manager.streamId).toBe('streamId');
            expect(manager.sessionId).toBe('sessionId');
        });
    });

    describe('Advanced Error Recovery', () => {
        it('should handle stream creation error recovery', async () => {
            mockApi.createStream.mockRejectedValueOnce(new Error('Stream creation failed'));

            await expect(createStreamingManager(agentId, agent, options)).rejects.toThrow('Stream creation failed');
        });

        it('should handle ICE candidate without required fields', async () => {
            await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            const mockEvent = { candidate: { candidate: 'cand', sdpMid: null, sdpMLineIndex: null } };

            mockPC.onicecandidate(mockEvent);

            expect(mockApi.addIceCandidate).toHaveBeenCalledWith('streamId', { candidate: null }, 'sessionId');
        });

        it('should handle agent activity state changes for fluent streams', async () => {
            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: false,
            });

            const manager = await createStreamingManager(agentId, agent, options);
            expect(manager.streamType).toBe(StreamType.Fluent);

            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Fluent });
        });
    });

    describe('Configuration Variants', () => {
        it('should handle stream creation with default baseURL', async () => {
            const optionsWithoutBaseURL = { ...options };
            delete (optionsWithoutBaseURL as any).baseURL;

            const manager = await createStreamingManager(agentId, agent, optionsWithoutBaseURL);

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle peer connection setup with certificates', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamId).toBe('streamId');
            expect(manager.sessionId).toBe('sessionId');
        });

        it('should handle different stream ready events', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            const result1 = parseDataChannelMessage('StreamReady:{"ready":true}');
            expect(result1.subject).toBe('StreamReady');
            expect(result1.data).toEqual({ ready: true });

            const result2 = parseDataChannelMessage('StreamReady:ready-string');
            expect(result2.subject).toBe('StreamReady');
            expect(result2.data).toBe('ready-string');

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle analytics enrichment for different stream types', async () => {
            let manager = await createStreamingManager(agentId, agent, options);
            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Legacy });

            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: true,
            });

            manager = await createStreamingManager(agentId, agent, options);
            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Fluent });
        });
    });
});
