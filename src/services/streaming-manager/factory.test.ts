import { AgentFactory, StreamingManagerOptionsFactory } from '../../test-utils/factories';
import { CreateStreamOptions, CreateStreamV2Options, Providers, StreamingManagerOptions, Transport } from '../../types';
import { createStreamingManager, StreamVersion } from './factory';

const mockCreateWebRTCStreamingManager = jest.fn();
jest.mock('./webrtc-manager', () => ({
    createWebRTCStreamingManager: (...args: any[]) => mockCreateWebRTCStreamingManager(...args),
}));

const mockCreateLiveKitStreamingManager = jest.fn();
jest.mock('./livekit-manager', () => ({
    createLiveKitStreamingManager: (...args: any[]) => mockCreateLiveKitStreamingManager(...args),
}));

describe('createStreamingManager', () => {
    let mockStreamOptions: CreateStreamOptions;
    let mockOptions: StreamingManagerOptions;

    beforeEach(() => {
        jest.clearAllMocks();

        mockStreamOptions = {
            stream_warmup: false,
        };

        mockOptions = StreamingManagerOptionsFactory.build();
    });

    it('calls to createWebRTCStreamingManager when agent presenter type is talk', async () => {
        const agent = AgentFactory.build({
            presenter: {
                type: 'talk',
                source_url: 'https://example.com/presenter',
                voice: {
                    type: Providers.Microsoft,
                    voice_id: 'voice-123',
                },
            },
        });

        await createStreamingManager(agent, { version: StreamVersion.V1, ...mockStreamOptions }, mockOptions);

        expect(mockCreateWebRTCStreamingManager).toHaveBeenCalledWith(agent.id, mockStreamOptions, mockOptions);
        expect(mockCreateLiveKitStreamingManager).not.toHaveBeenCalled();
    });

    it('calls to createWebRTCStreamingManager when agent presenter type is clip', async () => {
        const agent = AgentFactory.build({
            presenter: {
                type: 'clip',
                driver_id: 'driver-123',
                presenter_id: 'presenter-123',
                voice: {
                    type: Providers.Microsoft,
                    voice_id: 'voice-123',
                },
            },
        });

        await createStreamingManager(agent, { version: StreamVersion.V1, ...mockStreamOptions }, mockOptions);

        expect(mockCreateWebRTCStreamingManager).toHaveBeenCalledWith(agent.id, mockStreamOptions, mockOptions);
        expect(mockCreateLiveKitStreamingManager).not.toHaveBeenCalled();
    });

    it('calls to createLiveKitStreamingManager when agent presenter type is expressive', async () => {
        const agent = AgentFactory.build({
            presenter: {
                type: 'expressive',
                voice: {
                    type: Providers.Microsoft,
                    voice_id: 'voice-123',
                },
            },
        });

        const v2StreamOptions: CreateStreamV2Options = {
            transport_provider: Transport.Livekit,
            chat_id: 'chat-123',
        };

        await createStreamingManager(agent, { version: StreamVersion.V2, ...v2StreamOptions }, mockOptions);

        expect(mockCreateLiveKitStreamingManager).toHaveBeenCalledWith(agent.id, v2StreamOptions, mockOptions);
        expect(mockCreateWebRTCStreamingManager).not.toHaveBeenCalled();
    });
});
