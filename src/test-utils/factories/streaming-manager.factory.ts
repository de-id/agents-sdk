import { Factory } from 'rosie';

export const StreamingManagerFactory = new Factory().attrs({
    streamId: 'stream-123',
    sessionId: 'session-123',
    streamType: 'legacy' as const,
    interruptAvailable: false,
    speak: () => jest.fn().mockResolvedValue({ status: 'success', duration: 5000, video_id: 'video-123' }),
    disconnect: () => jest.fn().mockResolvedValue(undefined),
    sendDataChannelMessage: () => jest.fn(),
});

export const StreamingManagerOptionsFactory = new Factory().attrs({
    debug: false,
    callbacks: () => ({
        onError: jest.fn(),
        onStreamCreated: jest.fn(),
        onConnectionStateChange: jest.fn(),
        onVideoStateChange: jest.fn(),
        onAgentActivityStateChange: jest.fn(),
        onConnectivityStateChange: jest.fn(),
        onSrcObjectReady: jest.fn(),
        onVideoIdChange: jest.fn(),
        onMessage: jest.fn(),
    }),
    auth: {
        type: 'bearer' as const,
        token: 'test-token',
    },
    baseURL: 'http://example.com',
    analytics: () => ({
        token: 'test',
        isEnabled: true,
        agentId: '123',
        getRandom: jest.fn(() => 'random'),
        track: jest.fn(),
        linkTrack: jest.fn(),
        enrich: jest.fn(),
        additionalProperties: {},
    }),
});
