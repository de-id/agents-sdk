import { Factory } from 'rosie';

import { AgentManagerOptions, ChatMode } from '../../types';

export const AgentManagerOptionsFactory = new Factory<AgentManagerOptions>().attrs({
    auth: {
        type: 'key' as const,
        clientKey: 'test-key',
    },
    callbacks: () => ({
        onError: jest.fn(),
        onNewMessage: jest.fn(),
        onConnectionStateChange: jest.fn(),
        onNewChat: jest.fn(),
        onModeChange: jest.fn(),
        onVideoStateChange: jest.fn(),
        onAgentActivityStateChange: jest.fn(),
        onSrcObjectReady: jest.fn(),
    }),
    mode: ChatMode.Functional,
    enableAnalitics: true,
    persistentChat: true,
});
