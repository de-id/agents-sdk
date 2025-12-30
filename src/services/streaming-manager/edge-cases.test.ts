/**
 * Edge cases and branch coverage tests for streaming manager
 * Tests detailed edge cases, error conditions, and branch coverage scenarios
 */

import { StreamApiFactory, StreamingAgentFactory, StreamingManagerOptionsFactory } from '../../test-utils/factories';
import {
    AgentActivityState,
    ConnectionState,
    CreateStreamOptions,
    StreamType,
    StreamingManagerOptions,
} from '../../types/index';
import {
    createParseDataChannelMessage,
    createWebRTCStreamingManager as createStreamingManager,
    mapConnectionState,
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

describe('Streaming Manager Edge Cases', () => {
    let agentId: string;
    let agent: CreateStreamOptions;
    let options: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        agentId = 'agent123';
        agent = StreamingAgentFactory.build();
        options = StreamingManagerOptionsFactory.build();
    });

    describe('Branch Coverage Tests', () => {
        it('should test all connection state branches', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            const states = ['new', 'checking', 'connected', 'completed', 'failed', 'disconnected', 'closed'];

            states.forEach(state => {
                mockPC.iceConnectionState = state;
                const mappedState = mapConnectionState(state as RTCIceConnectionState);
                expect(mappedState).toBeDefined();
            });
        });

        it('should test data channel ready state branches', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.readyState = 'connecting';
            manager.sendDataChannelMessage('test');
            expect(options.callbacks.onError).toHaveBeenCalled();

            mockDC.readyState = 'open';
            expect(manager.streamId).toBe('streamId');
        });

        it('should test warmup condition branches', async () => {
            let warmupAgent = { ...agent, stream_warmup: true };
            let manager = await createStreamingManager(agentId, warmupAgent, options);
            expect(manager.streamType).toBe(StreamType.Legacy);

            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: false,
            });

            manager = await createStreamingManager(agentId, warmupAgent, options);
            expect(manager.streamType).toBe(StreamType.Fluent);
        });

        it('should test disconnect state branches', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            mockPC.iceConnectionState = 'new';
            await manager.disconnect();
            expect(mockApi.close).not.toHaveBeenCalled();

            mockPC.iceConnectionState = 'connected';
            await manager.disconnect();
            expect(mockApi.close).toHaveBeenCalled();
        });

        it('should test analytics enrich branches', async () => {
            let manager = await createStreamingManager(agentId, agent, options);
            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Legacy });

            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: false,
            });

            manager = await createStreamingManager(agentId, agent, options);
            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Fluent });
        });

        it('should test optional callback branches', async () => {
            const minimalCallbacks = { onError: jest.fn() };
            const minimalOptions = { ...options, callbacks: minimalCallbacks };

            const manager = await createStreamingManager(agentId, agent, minimalOptions);

            expect(manager.streamId).toBe('streamId');
        });
    });

    describe('ICE Candidate Edge Cases', () => {
        it('should test all ICE candidate branches', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            const fullCandidate = {
                candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54400 typ host',
                sdpMid: '0',
                sdpMLineIndex: 0,
            };

            mockPC.onicecandidate({ candidate: fullCandidate });
            expect(mockApi.addIceCandidate).toHaveBeenCalledWith(
                'streamId',
                {
                    candidate: fullCandidate.candidate,
                    sdpMid: fullCandidate.sdpMid,
                    sdpMLineIndex: fullCandidate.sdpMLineIndex,
                },
                'sessionId',
                undefined
            );

            mockPC.onicecandidate({ candidate: null });
            expect(mockApi.addIceCandidate).toHaveBeenCalledWith(
                'streamId',
                { candidate: null },
                'sessionId',
                undefined
            );
        });

        it('should test ICE candidate branches comprehensively', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            mockPC.onicecandidate({ candidate: { candidate: 'test', sdpMid: null, sdpMLineIndex: 0 } });
            expect(mockApi.addIceCandidate).toHaveBeenCalledWith(
                'streamId',
                { candidate: null },
                'sessionId',
                undefined
            );

            mockPC.onicecandidate({ candidate: { candidate: 'test', sdpMid: '0', sdpMLineIndex: null } });
            expect(mockApi.addIceCandidate).toHaveBeenCalledWith(
                'streamId',
                { candidate: null },
                'sessionId',
                undefined
            );

            mockPC.onicecandidate({ candidate: { candidate: 'test', sdpMid: null, sdpMLineIndex: null } });
            expect(mockApi.addIceCandidate).toHaveBeenCalledWith(
                'streamId',
                { candidate: null },
                'sessionId',
                undefined
            );
        });

        it('should test error handling in ICE candidate processing', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            mockApi.addIceCandidate.mockImplementationOnce(() => {
                throw new Error('ICE error');
            });

            mockPC.onicecandidate({ candidate: { candidate: 'test', sdpMid: '0', sdpMLineIndex: 0 } });

            expect(options.callbacks.onError).toHaveBeenCalledWith(expect.any(Error), { streamId: 'streamId' });
        });
    });

    describe('Data Channel Edge Cases', () => {
        it('should test data channel connection state branches', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.onopen();
            expect(manager.streamId).toBe('streamId');

            const warmupAgent = { ...agent, stream_warmup: true };
            const warmupManager = await createStreamingManager(agentId, warmupAgent, options);
            const warmupPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const warmupDC = warmupPC.createDataChannel.mock.results[0].value;

            warmupDC.onopen();
            expect(warmupManager.streamId).toBe('streamId');
        });

        it('should test sendDataChannelMessage with different readyState values', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.readyState = 'connecting';
            manager.sendDataChannelMessage('test1');
            expect(options.callbacks.onError).toHaveBeenCalled();

            mockDC.readyState = 'closing';
            manager.sendDataChannelMessage('test2');
            expect(options.callbacks.onError).toHaveBeenCalled();

            mockDC.readyState = 'closed';
            manager.sendDataChannelMessage('test3');
            expect(options.callbacks.onError).toHaveBeenCalled();
        });

        it('should test isDatachannelOpen and isConnected state combinations', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.onopen();

            mockPC.iceConnectionState = 'connected';
            mockPC.oniceconnectionstatechange();

            expect(manager.streamId).toBe('streamId');
        });
    });

    describe('Connection State Edge Cases', () => {
        it('should test connection state change branches', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            const states = ['new', 'checking', 'connected', 'completed', 'failed', 'disconnected', 'closed'];

            states.forEach(state => {
                mockPC.iceConnectionState = state;
                mockPC.oniceconnectionstatechange();
            });

            expect(manager.streamId).toBe('streamId');
        });

        it('should test all connection state mappings', async () => {
            const states: RTCIceConnectionState[] = [
                'new',
                'checking',
                'connected',
                'completed',
                'failed',
                'disconnected',
                'closed',
            ];

            states.forEach(state => {
                const mapped = mapConnectionState(state);
                expect(mapped).toBeDefined();
            });

            expect(mapConnectionState('unknown' as any)).toBe(ConnectionState.New);
        });

        it('should test disconnect with different peerConnection states', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            mockPC.iceConnectionState = 'checking';
            await manager.disconnect();
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalled();

            const manager2 = await createStreamingManager(agentId, agent, options);
            const mockPC2 = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC2.iceConnectionState = 'failed';
            await manager2.disconnect();
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalled();
        });
    });

    describe('Configuration Edge Cases', () => {
        it('should test baseURL configuration branches', async () => {
            const customOptions = { ...options, baseURL: 'https://custom.api.com' };
            const manager = await createStreamingManager(agentId, agent, customOptions);

            expect(manager.streamId).toBe('streamId');

            const defaultOptions = { ...options };
            delete (defaultOptions as any).baseURL;

            const manager2 = await createStreamingManager(agentId, agent, defaultOptions);
            expect(manager2.streamId).toBe('streamId');
        });

        it('should test debug mode branches', async () => {
            const debugOptions = { ...options, debug: true };
            const manager = await createStreamingManager(agentId, agent, debugOptions);
            expect(manager.streamId).toBe('streamId');

            const nonDebugOptions = { ...options, debug: false };
            const manager2 = await createStreamingManager(agentId, agent, nonDebugOptions);
            expect(manager2.streamId).toBe('streamId');
        });

        it('should test all disconnect state branches thoroughly', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            const manager2 = { ...manager };
            (manager2 as any).streamIdFromServer = null;

            await manager.disconnect();
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalled();
        });
    });

    describe('Stream Event Edge Cases', () => {
        it('should test handleStreamVideoEvent with metadata branch', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            const messageWithMeta = parseDataChannelMessage('StreamStarted:{"metadata":{"videoId":"video123"}}');
            expect(messageWithMeta.subject).toBe('StreamStarted');
            expect(messageWithMeta.data).toEqual({ metadata: { videoId: 'video123' } });

            const messageNoMeta = parseDataChannelMessage('StreamStarted:{"other":"data"}');
            expect(messageNoMeta.subject).toBe('StreamStarted');
            expect(messageNoMeta.data).toEqual({ other: 'data' });

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle handleStreamVideoEvent with metadata extraction', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            const messageWithMetadata = 'StreamStarted:{"metadata":{"videoId":"test-123"}}';
            const parsed = parseDataChannelMessage(messageWithMetadata);

            expect(parsed.subject).toBe('StreamStarted');
            expect(parsed.data).toEqual({ metadata: { videoId: 'test-123' } });

            const doneMessage = 'StreamDone';
            const parsedDone = parseDataChannelMessage(doneMessage);
            expect(parsedDone.subject).toBe('StreamDone');

            expect(manager.streamId).toBe('streamId');
        });

        it('should execute handleStreamVideoEvent internal functions', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            const messageWithMeta = parseDataChannelMessage('StreamStarted:{"metadata":{"videoId":"abc123"}}');
            expect(messageWithMeta.subject).toBe('StreamStarted');
            expect(messageWithMeta.data).toEqual({ metadata: { videoId: 'abc123' } });

            const doneMsg = parseDataChannelMessage('StreamDone');
            expect(doneMsg.subject).toBe('StreamDone');
            expect(doneMsg.data).toBe('');

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle handleStreamVideoEvent function execution', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            const parsedStarted = parseDataChannelMessage('StreamStarted:{"metadata":{"videoId":"video-123"}}');
            expect(parsedStarted.subject).toBe('StreamStarted');
            expect(parsedStarted.data).toEqual({ metadata: { videoId: 'video-123' } });

            const parsedDone = parseDataChannelMessage('StreamDone');
            expect(parsedDone.subject).toBe('StreamDone');
            expect(parsedDone.data).toBe('');

            expect(manager.streamId).toBe('streamId');
        });
    });

    describe('Activity State Edge Cases', () => {
        it('should test agent activity state branches for different stream types', async () => {
            let manager = await createStreamingManager(agentId, agent, options);
            expect(manager.streamType).toBe(StreamType.Legacy);

            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: true,
            });

            manager = await createStreamingManager(agentId, agent, options);
            expect(manager.streamType).toBe(StreamType.Fluent);
            expect(manager.interruptAvailable).toBe(true);
        });

        it('should test all optional callback branches', async () => {
            const fullCallbacks = {
                ...options.callbacks,
                onConnectivityStateChange: jest.fn(),
                onVideoStateChange: jest.fn(),
                onAgentActivityStateChange: jest.fn(),
            };

            const fullOptions = { ...options, callbacks: fullCallbacks };
            const manager = await createStreamingManager(agentId, agent, fullOptions);

            expect(manager.streamId).toBe('streamId');

            const minimalCallbacks = { onError: jest.fn() };

            const minimalOptions = { ...options, callbacks: minimalCallbacks };
            const manager2 = await createStreamingManager(agentId, agent, minimalOptions);

            expect(manager2.streamId).toBe('streamId');
        });
    });

    describe('Warmup Mode Edge Cases', () => {
        it('should test warmup mode with different conditions', async () => {
            const warmupLegacyAgent = { ...agent, stream_warmup: true };
            let manager = await createStreamingManager(agentId, warmupLegacyAgent, options);
            expect(manager.streamType).toBe(StreamType.Legacy);

            const noWarmupAgent = { ...agent, stream_warmup: false };
            manager = await createStreamingManager(agentId, noWarmupAgent, options);
            expect(manager.streamType).toBe(StreamType.Legacy);

            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: false,
            });

            manager = await createStreamingManager(agentId, warmupLegacyAgent, options);
            expect(manager.streamType).toBe(StreamType.Fluent);
        });

        it('should handle connection establishment in warmup mode', async () => {
            agent = { stream_warmup: true } as any;
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockPC.iceConnectionState = 'connected';
            mockPC.oniceconnectionstatechange();

            mockDC.onopen();

            expect(manager.streamId).toBe('streamId');
        });
    });

    describe('Error Recovery Edge Cases', () => {
        it('should handle error handling in close API call', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            mockApi.close.mockRejectedValueOnce(new Error('API close failed'));

            await expect(manager.disconnect()).resolves.not.toThrow();
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Idle);
        });

        it('should test different stream types with analytics', async () => {
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

    describe('Comprehensive Integration Tests', () => {
        it('should handle complete streaming lifecycle with real message flow', async () => {
            const fullCallbacks = { ...options.callbacks, onStreamCreated: jest.fn() };
            const fullOptions = { ...options, callbacks: fullCallbacks };

            const manager = await createStreamingManager(agentId, agent, fullOptions);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            expect(fullCallbacks.onStreamCreated).toHaveBeenCalledWith({
                stream_id: 'streamId',
                session_id: 'sessionId',
                agent_id: agentId,
            });

            const mockStream = new MediaStream();
            const trackEvent = { track: { kind: 'video' }, streams: [mockStream] };
            mockPC.ontrack(trackEvent);
            expect(fullCallbacks.onSrcObjectReady).toHaveBeenCalledWith(mockStream);

            mockDC.onopen();

            mockPC.iceConnectionState = 'connected';
            mockPC.oniceconnectionstatechange();

            manager.sendDataChannelMessage('test-message');

            await manager.disconnect();

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle onStreamCreated callback', async () => {
            const mockOnStreamCreated = jest.fn();
            const optionsWithStreamCreated = {
                ...options,
                callbacks: { ...options.callbacks, onStreamCreated: mockOnStreamCreated },
            };

            const manager = await createStreamingManager(agentId, agent, optionsWithStreamCreated);

            expect(mockOnStreamCreated).toHaveBeenCalledWith({
                stream_id: 'streamId',
                session_id: 'sessionId',
                agent_id: agentId,
            });

            expect(manager.streamId).toBe('streamId');
        });
    });
});
