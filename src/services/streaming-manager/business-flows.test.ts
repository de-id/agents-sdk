/**
 * Business flow tests for streaming manager
 * Tests critical end-to-end workflows and configurations
 */

import { StreamApiFactory, StreamingAgentFactory, StreamingManagerOptionsFactory } from '../../test-utils/factories';
import { AgentActivityState, CreateStreamOptions, StreamType, StreamingManagerOptions } from '../../types/index';
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

describe('Streaming Manager Business Flows', () => {
    let agentId: string;
    let agent: CreateStreamOptions;
    let options: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();
        agentId = 'agent123';
        agent = StreamingAgentFactory.build();
        options = StreamingManagerOptionsFactory.build();
    });

    describe('Critical Business Flows', () => {
        // 1. CONNECTION FLOW: /streams → WebRTC → /streams/{id}/sdp
        it('should handle complete connection flow with API calls', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            // Verify connection API calls were made in correct order
            expect(mockApi.createStream).toHaveBeenCalledWith(agent, undefined);
            expect(mockApi.startConnection).toHaveBeenCalledWith(
                'streamId',
                expect.objectContaining({ type: 'answer' }),
                'sessionId',
                undefined
            );

            // Verify stream creation callback
            expect(options.callbacks.onStreamCreated).toHaveBeenCalledWith({
                stream_id: 'streamId',
                session_id: 'sessionId',
                agent_id: agentId,
            });

            expect(manager.streamId).toBe('streamId');
            expect(manager.sessionId).toBe('sessionId');
        });

        // 2. DISCONNECTION FLOW: DELETE /streams/{id}
        it('should handle complete disconnection flow with API calls', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;

            // Set up connected state
            mockPC.iceConnectionState = 'connected';

            await manager.disconnect();

            // Verify disconnection API call
            expect(mockApi.close).toHaveBeenCalledWith('streamId', 'sessionId');

            // Verify cleanup
            expect(mockPC.close).toHaveBeenCalled();
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Idle);
        });

        // 3. MESSAGE SENDING FLOW: POST /streams/{id}
        it('should handle message sending via speak method', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            const testPayload = {
                type: 'talk',
                message: 'Hello world',
                script: { type: 'text', input: 'test' },
                metadata: {},
            } as any;

            await manager.speak(testPayload);

            // Verify API call
            expect(mockApi.sendStreamRequest).toHaveBeenCalledWith('streamId', 'sessionId', testPayload);
        });

        // 4. WEBSOCKET/DATA CHANNEL MESSAGE HANDLING
        it('should handle data channel message flows', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            const mockDC = mockPC.createDataChannel.mock.results[0].value;

            // Test data channel message handler setup
            expect(typeof mockDC.onmessage).toBe('function');

            // Test different message types would be handled
            expect(manager.streamId).toBe('streamId');
        });
    });

    describe('Fluent Configuration Flows', () => {
        it('should handle fluent=false (v1/legacy mode)', async () => {
            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamType).toBe(StreamType.Legacy);
            expect(options.analytics.enrich).toHaveBeenCalledWith({ 'stream-type': StreamType.Legacy });
        });

        it('should handle fluent=true (v2 mode)', async () => {
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

        it('should handle fluent with interrupt enabled', async () => {
            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: 'sessionId',
                fluent: true,
                interrupt_enabled: true,
            });

            const manager = await createStreamingManager(agentId, agent, options);

            expect(manager.streamType).toBe(StreamType.Fluent);
            expect(manager.interruptAvailable).toBe(true);
        });
    });

    describe('Error Handling Flows', () => {
        it('should handle connection failure', async () => {
            mockApi.createStream.mockRejectedValueOnce(new Error('Connection failed'));

            await expect(createStreamingManager(agentId, agent, options)).rejects.toThrow('Connection failed');
        });

        it('should handle missing session_id', async () => {
            mockApi.createStream.mockResolvedValueOnce({
                id: 'streamId',
                offer: { type: 'offer', sdp: 'sdp' },
                ice_servers: [],
                session_id: null, // Missing session_id
                fluent: false,
                interrupt_enabled: false,
            });

            await expect(createStreamingManager(agentId, agent, options)).rejects.toThrow(
                'Could not create session_id'
            );
        });

        it('should handle disconnection errors gracefully', async () => {
            const manager = await createStreamingManager(agentId, agent, options);
            const mockPC = (window.RTCPeerConnection as any).mock.results[0].value;
            mockPC.iceConnectionState = 'connected';

            // Mock API close to fail
            mockApi.close.mockRejectedValueOnce(new Error('Disconnect failed'));

            // Should not throw error
            await expect(manager.disconnect()).resolves.not.toThrow();

            // Should still clean up
            expect(options.callbacks.onAgentActivityStateChange).toHaveBeenCalledWith(AgentActivityState.Idle);
        });
    });
});
