const mockDataChannel = { onopen: null, onmessage: null, send: jest.fn(), readyState: 'open' };

const mockPeerConnection = {
    createDataChannel: jest.fn(() => mockDataChannel),
    onicecandidate: jest.fn(),
    oniceconnectionstatechange: jest.fn(),
    ontrack: jest.fn(),
    setRemoteDescription: jest.fn().mockResolvedValue(undefined),
    createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
    setLocalDescription: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    iceConnectionState: 'connected',
};

const mockRTCPeerConnection = jest.fn().mockImplementation(() => mockPeerConnection);
(mockRTCPeerConnection as any).generateCertificate = jest.fn().mockResolvedValue({});

// Mock MediaStream
global.MediaStream = jest.fn().mockImplementation(() => ({ getTracks: jest.fn(() => []) }));

global.window.RTCPeerConnection = mockRTCPeerConnection as any;
