import { AgentFactory, StreamingManagerOptionsFactory } from '../../test-utils/factories';
import { CreateStreamOptions, Providers, StreamingManagerOptions } from '../../types';
import { createStreamingManager } from './factory';

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

        await createStreamingManager(agent, mockStreamOptions, mockOptions);

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

        await createStreamingManager(agent, mockStreamOptions, mockOptions);

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

        await createStreamingManager(agent, mockStreamOptions, mockOptions);

        expect(mockCreateLiveKitStreamingManager).toHaveBeenCalledWith(agent.id, mockStreamOptions, mockOptions);
        expect(mockCreateWebRTCStreamingManager).not.toHaveBeenCalled();
    });
});
