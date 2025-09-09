import { Factory } from 'rosie';

export const StreamApiFactory = new Factory().attrs({
    createStream: () =>
        jest.fn().mockResolvedValue({
            id: 'streamId',
            offer: { type: 'offer', sdp: 'sdp' },
            ice_servers: [],
            session_id: 'sessionId',
            fluent: false,
            interrupt_enabled: false,
        }),
    startConnection: () => jest.fn(),
    sendStreamRequest: () => jest.fn(),
    close: () => jest.fn(),
    addIceCandidate: () => jest.fn(),
});
