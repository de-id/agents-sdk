import { AgentFactory, StreamingManagerOptionsFactory } from '../../test-utils/factories';
import {
    AvatarType,
    CreateSessionV2Options,
    CreateStreamOptions,
    StreamingManagerOptions,
    TransportProvider,
} from '../../types';
import { StreamApiVersion, createStreamingManager } from './factory';

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
            avatar: {
                type: AvatarType.Talk,
                voice: { language: 'en-US' },
            },
        });

        await createStreamingManager(
            { id: agent.id, avatar: agent.avatar },
            { version: StreamApiVersion.V1, ...mockStreamOptions },
            mockOptions
        );

        expect(mockCreateWebRTCStreamingManager).toHaveBeenCalledWith(
            agent.id,
            mockStreamOptions,
            mockOptions,
            undefined
        );
        expect(mockCreateLiveKitStreamingManager).not.toHaveBeenCalled();
    });

    it('calls to createWebRTCStreamingManager when agent presenter type is clip', async () => {
        const agent = AgentFactory.build({
            avatar: {
                type: AvatarType.Clip,
                voice: { language: 'en-US' },
            },
        });

        await createStreamingManager(
            { id: agent.id, avatar: agent.avatar },
            { version: StreamApiVersion.V1, ...mockStreamOptions },
            mockOptions
        );

        expect(mockCreateWebRTCStreamingManager).toHaveBeenCalledWith(
            agent.id,
            mockStreamOptions,
            mockOptions,
            undefined
        );
        expect(mockCreateLiveKitStreamingManager).not.toHaveBeenCalled();
    });

    it('calls to createLiveKitStreamingManager when agent presenter type is expressive', async () => {
        const agent = AgentFactory.build({
            avatar: {
                type: AvatarType.Expressive,
                voice: { language: 'en-US' },
            },
        });

        const v2StreamOptions: CreateSessionV2Options = {
            transport: {
                provider: TransportProvider.Livekit,
            },
            chat_persist: true,
        };

        await createStreamingManager(
            { id: agent.id, avatar: agent.avatar },
            { version: StreamApiVersion.V2, ...v2StreamOptions },
            mockOptions
        );

        expect(mockCreateLiveKitStreamingManager).toHaveBeenCalledWith(agent.id, v2StreamOptions, mockOptions);
        expect(mockCreateWebRTCStreamingManager).not.toHaveBeenCalled();
    });
});
