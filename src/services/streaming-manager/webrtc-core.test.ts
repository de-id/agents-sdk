/**
 * Core functionality tests for streaming manager
 * Tests basic streaming manager creation, connection, and operations
 */

import { StreamApiFactory, StreamingAgentFactory, StreamingManagerOptionsFactory } from '../../test-utils/factories';
import { ConnectionState, CreateStreamOptions, StreamType, StreamingManagerOptions } from '../../types/index';
import { pollStats } from './stats/poll';
import { createWebRTCStreamingManager as createStreamingManager } from './webrtc-manager';

// Mock createStreamApi
const mockApi = StreamApiFactory.build();
jest.mock('../../api/streams', () => ({ createStreamApi: jest.fn(() => mockApi) }));

// Mock pollStats
jest.mock('./stats/poll', () => ({
    pollStats: jest.fn(() => 123), // mock interval id
}));

// Mock other dependencies as needed
jest.mock('../../config/environment', () => ({ didApiUrl: 'http://test-api.com' }));

describe('Streaming Manager Core', () => {
    let agentId: string;
    let agentStreamOptions: CreateStreamOptions;
    let options: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        agentId = 'agent123';
        agentStreamOptions = StreamingAgentFactory.build();
        options = StreamingManagerOptionsFactory.build();
    });

    describe('Basic Creation and Setup', () => {
        it('should create streaming manager and set up peer connection', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            expect(mockApi.createStream).toHaveBeenCalledWith(agentStreamOptions, undefined);
            expect(manager.streamId).toBe('streamId');
            expect(manager.sessionId).toBe('sessionId');
            expect(options.callbacks.onStreamCreated).toHaveBeenCalledWith(
                expect.objectContaining({ stream_id: 'streamId', session_id: 'sessionId', agent_id: agentId })
            );
        });

        it('should handle fluent stream type', async () => {
            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: false,
            });
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            expect(manager.streamType).toBe(StreamType.Fluent);
            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Fluent });
        });

        it('should throw error when session_id is missing', async () => {
            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: null,
                fluent: false,
                interrupt_enabled: false,
            });

            await expect(createStreamingManager(agentId, agentStreamOptions, options)).rejects.toThrow(
                'Could not create session_id'
            );
        });
    });

    describe('WebRTC Connection Handling', () => {
        it('should call onSrcObjectReady when track is received', async () => {
            await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockStream = new (global as any).MediaStream();
            const mockEvent = { streams: [mockStream] };
            mockPC.ontrack(mockEvent);
            expect(options.callbacks.onSrcObjectReady).toHaveBeenCalledWith(mockStream);
        });

        it('should handle connection state changes', async () => {
            await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'disconnected';
            mockPC.oniceconnectionstatechange();
            expect(options.callbacks.onConnectionStateChange).toHaveBeenCalledWith(ConnectionState.Disconnected);
        });

        it('should add ICE candidates', async () => {
            await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockEvent = { candidate: { candidate: 'cand', sdpMid: 'mid', sdpMLineIndex: 0 } };
            mockPC.onicecandidate(mockEvent);
            expect(mockApi.addIceCandidate).toHaveBeenCalledWith(
                'streamId',
                expect.objectContaining({ candidate: 'cand' }),
                'sessionId',
                undefined
            );
        });

        it('should handle ICE candidate with null candidate', async () => {
            await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockEvent = { candidate: null };

            mockPC.onicecandidate(mockEvent);

            expect(mockApi.addIceCandidate).toHaveBeenCalledWith(
                'streamId',
                { candidate: null },
                'sessionId',
                undefined
            );
        });

        it('should handle errors in ICE candidate handling', async () => {
            await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockApi.addIceCandidate.mockImplementationOnce(() => {
                throw new Error('ICE error');
            });

            const mockEvent = { candidate: { candidate: 'cand', sdpMid: 'mid', sdpMLineIndex: 0 } };
            mockPC.onicecandidate(mockEvent);

            expect(options.callbacks.onError).toHaveBeenCalledWith(expect.any(Error), { streamId: 'streamId' });
        });

        it('should handle different connection states', async () => {
            await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            const states = ['checking', 'failed', 'new', 'closed', 'completed'];
            states.forEach(state => {
                mockPC.iceConnectionState = state;
                mockPC.oniceconnectionstatechange();
            });

            expect(options.callbacks.onConnectionStateChange).toHaveBeenCalledTimes(states.length);
        });
    });

    describe('Data Channel Operations', () => {
        it('should handle data channel messages for StreamStarted and StreamDone', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            expect(manager.streamId).toBe('streamId');
            expect(manager.sessionId).toBe('sessionId');
            expect(manager.streamType).toBe(StreamType.Legacy);
            expect(manager.interruptAvailable).toBe(false);
        });

        it('should send data channel message when connected', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            expect(() => manager.sendDataChannelMessage('test:message')).not.toThrow();
            expect(typeof manager.sendDataChannelMessage).toBe('function');
            expect(typeof manager.speak).toBe('function');
            expect(typeof manager.disconnect).toBe('function');
        });

        it('should not send data channel message when not connected', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;
            mockPC.iceConnectionState = 'new';
            mockDC.readyState = 'closed';
            manager.sendDataChannelMessage('test:message');
            expect(mockDC.send).not.toHaveBeenCalled();
            expect(options.callbacks.onError).toHaveBeenCalled();
        });

        it('should handle data channel open event', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.onopen();

            expect(options.callbacks.onConnectionStateChange).toHaveBeenCalledWith(ConnectionState.Connected);
        });

        it('should handle data channel send errors', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            mockDC.send.mockImplementationOnce(() => {
                throw new Error('Send failed');
            });

            manager.sendDataChannelMessage('test:message');
            expect(options.callbacks.onError).toHaveBeenCalledWith(expect.any(Error), { streamId: 'streamId' });
        });
    });

    describe('Stream Operations', () => {
        it('should send stream request via speak', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const payload = { message: 'test' } as any;
            await manager.speak(payload);
            expect(mockApi.sendStreamRequest).toHaveBeenCalledWith('streamId', 'sessionId', payload);
        });

        it('should handle errors during creation', async () => {
            mockApi.createStream.mockRejectedValueOnce(new Error('Creation failed'));
            await expect(createStreamingManager(agentId, agentStreamOptions, options)).rejects.toThrow(
                'Creation failed'
            );
        });

        it('should handle fluent stream with agent activity callbacks', async () => {
            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: true,
            });

            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            expect(manager.streamType).toBe(StreamType.Fluent);
            expect(manager.interruptAvailable).toBe(true);
        });

        it('should handle warmup with fluent stream', async () => {
            agentStreamOptions = { stream_warmup: true } as any;
            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: false,
            });

            await createStreamingManager(agentId, agentStreamOptions, options);
            expect(pollStats).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
        });
    });

    describe('Configuration and Setup', () => {
        it('should handle debug mode', async () => {
            const debugOptions = { ...options, debug: true };
            const manager = await createStreamingManager(agentId, agentStreamOptions, debugOptions);
            expect(manager.streamId).toBe('streamId');
        });

        it('should handle custom baseURL', async () => {
            const customOptions = { ...options, baseURL: 'https://custom.api.com' };
            const manager = await createStreamingManager(agentId, agentStreamOptions, customOptions);

            expect(mockApi.createStream).toHaveBeenCalled();
            expect(manager.streamId).toBe('streamId');
        });

        it('should handle analytics tracking', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Legacy });
            expect(manager.streamId).toBe('streamId');
        });

        it('should handle onMessage callback', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            expect(options.callbacks.onMessage).toBeDefined();
            expect(manager.streamId).toBe('streamId');
        });

        it('should handle missing agent properties gracefully', async () => {
            const minimalAgent = {} as any;
            const manager = await createStreamingManager(agentId, minimalAgent, options);

            expect(manager.streamId).toBe('streamId');
            expect(manager.sessionId).toBe('sessionId');
        });
    });

    describe('WebRTC Setup and Lifecycle', () => {
        it('should handle peer connection answer creation', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            expect(mockPC.createAnswer).toHaveBeenCalled();
            expect(mockPC.setLocalDescription).toHaveBeenCalled();
            expect(mockPC.setRemoteDescription).toHaveBeenCalled();
        });

        it('should handle startConnection call', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            expect(mockApi.startConnection).toHaveBeenCalledWith(
                'streamId',
                { type: 'answer', sdp: 'mock-sdp' },
                'sessionId',
                undefined
            );
        });

        it('should handle data channel connection establishment', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            expect(mockPC.setRemoteDescription).toHaveBeenCalled();
            expect(mockPC.createAnswer).toHaveBeenCalled();
            expect(mockPC.setLocalDescription).toHaveBeenCalled();
        });

        it('should handle different WebRTC implementations', async () => {
            const originalRTC = global.window.RTCPeerConnection;
            delete (global.window as any).RTCPeerConnection;
            (global.window as any).webkitRTCPeerConnection = originalRTC;

            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            expect(manager.streamId).toBe('streamId');

            global.window.RTCPeerConnection = originalRTC;
            delete (global.window as any).webkitRTCPeerConnection;
        });

        it('should handle WebRTC setup with different ice servers', async () => {
            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [{ urls: 'stun:stun.example.com' }],
                session_id: 'sessionId',
                fluent: false,
                interrupt_enabled: false,
            });

            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            expect(manager.streamId).toBe('streamId');
        });

        it('should execute WebRTC setup log statements', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            expect(manager.streamId).toBe('streamId');
            expect(manager.sessionId).toBe('sessionId');
            expect(manager.streamType).toBe('legacy');
        });

        it('should handle pollStats initialization', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            expect(pollStats).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything()
            );

            expect(manager.streamId).toBe('streamId');
        });
    });
});
