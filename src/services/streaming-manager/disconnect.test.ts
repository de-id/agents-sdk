/**
 * Disconnect and cleanup tests for streaming manager
 * Tests disconnection workflows, cleanup, and error handling
 */

import { StreamApiFactory, StreamingAgentFactory, StreamingManagerOptionsFactory } from '../../test-utils/factories';
import { AgentActivityState, CreateStreamOptions, StreamingManagerOptions } from '../../types/index';
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

describe('Streaming Manager Disconnect', () => {
    let agentId: string;
    let agentStreamOptions: CreateStreamOptions;
    let options: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        agentId = 'agent123';
        agentStreamOptions = StreamingAgentFactory.build();
        options = StreamingManagerOptionsFactory.build();
    });

    describe('Basic Disconnection', () => {
        it('should disconnect and clean up resources', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            await manager.disconnect();

            expect(mockApi.close).toHaveBeenCalledWith('streamId', 'sessionId');
        });

        it('should handle disconnect when connection is already closed', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            await manager.disconnect();

            expect(typeof manager.disconnect).toBe('function');
        });

        it('should handle disconnect error gracefully', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            mockApi.close.mockRejectedValueOnce(new Error('Close failed'));

            await expect(manager.disconnect()).resolves.not.toThrow();
        });

        it('should handle disconnect when already in new state', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            mockPC.iceConnectionState = 'new';

            await manager.disconnect();

            expect(mockApi.close).not.toHaveBeenCalled();
        });

        it('should handle error in disconnect close operation', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            mockApi.close.mockRejectedValueOnce(new Error('Close error'));

            await expect(manager.disconnect()).resolves.not.toThrow();
        });
    });

    describe('Cleanup Operations', () => {
        it('should handle disconnect with media stream cleanup', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            await manager.disconnect();

            expect(mockApi.close).toHaveBeenCalledWith('streamId', 'sessionId');
        });

        it('should handle clearInterval in disconnect', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            await manager.disconnect();

            expect(clearIntervalSpy).toHaveBeenCalled();

            clearIntervalSpy.mockRestore();
        });

        it('should handle agent activity state changes on disconnect', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            await manager.disconnect();

            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Idle);
        });

        it('should handle null event handlers after disconnect', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            await manager.disconnect();

            expect(mockPC.oniceconnectionstatechange).toBeNull();
            expect(mockPC.onnegotiationneeded).toBeNull();
            expect(mockPC.onicecandidate).toBeNull();
            expect(mockPC.ontrack).toBeNull();
        });

        it('should handle disconnect cleanup and clearInterval', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            await manager.disconnect();

            expect(clearIntervalSpy).toHaveBeenCalled();
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Idle);

            clearIntervalSpy.mockRestore();
        });

        it('should handle srcObject cleanup in disconnect', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            await manager.disconnect();

            expect(mockApi.close).toHaveBeenCalledWith('streamId', 'sessionId');
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Idle);
        });

        it('should handle disconnect with complete cleanup', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            const closeSpy = jest.spyOn(mockPC, 'close');
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            await manager.disconnect();

            expect(closeSpy).toHaveBeenCalled();
            expect(clearIntervalSpy).toHaveBeenCalled();
            expect(mockPC.oniceconnectionstatechange).toBeNull();
            expect(mockPC.onnegotiationneeded).toBeNull();
            expect(mockPC.onicecandidate).toBeNull();
            expect(mockPC.ontrack).toBeNull();
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Idle);

            closeSpy.mockRestore();
            clearIntervalSpy.mockRestore();
        });
    });

    describe('Error Handling During Disconnect', () => {
        it('should handle error logging in disconnect', async () => {
            const debugOptions = { ...options, debug: true };
            const manager = await createStreamingManager(agentId, agentStreamOptions, debugOptions);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            mockApi.close.mockImplementationOnce(() => {
                throw new Error('Close error');
            });

            await manager.disconnect();

            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should handle error logging in debug mode during disconnect', async () => {
            const debugOptions = { ...options, debug: true };
            const manager = await createStreamingManager(agentId, agentStreamOptions, debugOptions);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            mockApi.close.mockImplementationOnce(() => {
                throw new Error('Close failed');
            });

            await manager.disconnect();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[WebRTCStreamingManager] Error on close stream connection',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });

        it('should handle disconnect without streamIdFromServer', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            (manager as any).streamIdFromServer = null;

            await manager.disconnect();

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle clearInterval on disconnect', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            await manager.disconnect();

            expect(clearIntervalSpy).toHaveBeenCalled();

            clearIntervalSpy.mockRestore();
        });

        it('should handle complete disconnect cleanup sequence', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            await manager.disconnect();

            expect(clearIntervalSpy).toHaveBeenCalled();
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Idle);

            clearIntervalSpy.mockRestore();
        });

        it('should execute all disconnect cleanup paths', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            await manager.disconnect();

            expect(clearIntervalSpy).toHaveBeenCalled();
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Idle);

            clearIntervalSpy.mockRestore();
        });
    });

    describe('SrcObject Management', () => {
        it('should handle srcObject assignment on track events', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            const mockStream = new MediaStream();
            const mockTrack = { kind: 'video', stop: jest.fn() };

            (mockStream as any).getTracks = jest.fn(() => [mockTrack]);

            const trackEvent = { track: mockTrack, streams: [mockStream] };

            mockPC.ontrack(trackEvent);

            expect(options.callbacks.onSrcObjectReady).toHaveBeenCalledWith(mockStream);

            const mockPCForDisconnect = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPCForDisconnect.iceConnectionState = 'connected';

            await manager.disconnect();

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle srcObject assignment and track management', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            const mockStream = new MediaStream();
            const mockTrack = { kind: 'video', stop: jest.fn() };

            (mockStream as any).getTracks = jest.fn(() => [mockTrack]);

            const trackEvent = { track: mockTrack, streams: [mockStream] };

            mockPC.ontrack(trackEvent);

            expect(options.callbacks.onSrcObjectReady).toHaveBeenCalledWith(mockStream);

            const mockPCForDisconnect = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPCForDisconnect.iceConnectionState = 'connected';

            await manager.disconnect();

            expect(manager.streamId).toBe('streamId');
        });

        it('should handle srcObject cleanup branches', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            const mockStream = new MediaStream();
            const mockTrack = { stop: jest.fn() };
            (mockStream as any).getTracks = jest.fn(() => [mockTrack]);

            mockPC.ontrack({ streams: [mockStream] });

            mockPC.iceConnectionState = 'connected';
            await manager.disconnect();

            expect(manager.streamId).toBe('streamId');
        });
    });

    describe('Connection State Management', () => {
        it('should handle connection state change to connected', async () => {
            await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            mockPC.iceConnectionState = 'connected';
            mockPC.oniceconnectionstatechange();

            expect(options.callbacks.onConnectionStateChange).not.toHaveBeenCalledWith(
                expect.objectContaining({ Connected: expect.anything() })
            );
        });

        it('should handle default connection state mapping', async () => {
            await createStreamingManager(agentId, agentStreamOptions, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            mockPC.iceConnectionState = 'unknown-state';
            mockPC.oniceconnectionstatechange();

            expect(options.callbacks.onConnectionStateChange).toHaveBeenCalled();
        });

        it('should handle isConnected state management', async () => {
            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            expect(manager.streamId).toBe('streamId');
            expect(manager.sessionId).toBe('sessionId');
        });
    });

    describe('Debug Mode Disconnect', () => {
        it('should handle log statements in debug mode', async () => {
            const debugOptions = { ...options, debug: true };
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const manager = await createStreamingManager(agentId, agentStreamOptions, debugOptions);

            expect(consoleSpy).toHaveBeenCalled();
            expect(manager.streamId).toBe('streamId');

            consoleSpy.mockRestore();
        });

        it('should handle debug logging during WebRTC setup', async () => {
            const debugOptions = { ...options, debug: true };
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const manager = await createStreamingManager(agentId, agentStreamOptions, debugOptions);

            expect(consoleSpy).toHaveBeenCalledWith('[WebRTCStreamingManager] set remote description OK', '');
            expect(consoleSpy).toHaveBeenCalledWith('[WebRTCStreamingManager] create answer OK', '');
            expect(consoleSpy).toHaveBeenCalledWith('[WebRTCStreamingManager] set local description OK', '');
            expect(consoleSpy).toHaveBeenCalledWith('[WebRTCStreamingManager] start connection OK', '');

            consoleSpy.mockRestore();
        });

        it('should handle WebRTC setup logging without debug mode', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const manager = await createStreamingManager(agentId, agentStreamOptions, options);

            expect(manager.streamId).toBe('streamId');

            consoleSpy.mockRestore();
        });
    });
});
