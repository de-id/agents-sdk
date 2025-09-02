import { createAgentsApi } from '../../api/agents';
import { Agent, AgentManager, AgentManagerOptions, ChatMode, ConnectionState, StreamType } from '../../types';
import { initializeAnalytics } from '../analytics/mixpanel';
import { createChat } from '../chat';
import { getInitialMessages } from '../chat/intial-messages';
import { sendInterrupt, validateInterrupt } from '../interrupt';
import { createSocketManager } from '../socket-manager';
import { createMessageEventQueue } from '../socket-manager/message-queue';
import { initializeStreamAndChat } from './connect-to-manager';
import { createAgentManager, getAgent } from './index';

// Mock all dependencies
jest.mock('../../api/agents');
jest.mock('../analytics/mixpanel');
jest.mock('../socket-manager');
jest.mock('./connect-to-manager');
jest.mock('../socket-manager/message-queue');
jest.mock('../chat/intial-messages');
jest.mock('../chat');
jest.mock('../interrupt');
jest.mock('../../utils/retry-operation', () => ({ retryOperation: jest.fn(fn => fn()) }));
jest.mock('../../utils', () => ({ getRandom: jest.fn(() => 'random-id-123') }));
jest.mock('../../utils/chat', () => ({
    isChatModeWithoutChat: jest.fn(() => false),
    isTextualChat: jest.fn(() => false),
}));
jest.mock('../../utils/analytics', () => ({
    getAgentInfo: jest.fn(() => ({ agentType: 'talk' })),
    getAnalyticsInfo: jest.fn(() => ({ agentType: 'talk' })),
}));
jest.mock('../analytics/timestamp-tracker', () => ({
    latencyTimestampTracker: { reset: jest.fn(), update: jest.fn(() => Date.now()), get: jest.fn(() => 1000) },
    interruptTimestampTracker: { reset: jest.fn(), update: jest.fn(), get: jest.fn(() => 500) },
}));
jest.mock('../../config/environment', () => ({
    didApiUrl: 'https://api.d-id.com',
    didSocketApiUrl: 'wss://api.d-id.com',
    mixpanelKey: 'test-mixpanel-key',
}));
jest.mock('../../config/consts', () => ({ CONNECTION_RETRY_TIMEOUT_MS: 5000 }));

describe('createAgentManager', () => {
    let mockAgent: Agent;
    let mockOptions: AgentManagerOptions;
    let mockAgentsApi: any;
    let mockAnalytics: any;
    let mockSocketManager: any;
    let mockStreamingManager: any;
    let mockChat: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockAgent = {
            id: 'agent-123',
            name: 'Test Agent',
            knowledge: {
                id: 'knowledge-123',
                starter_message: ['Hello!', 'How can I help?'],
                provider: 'pinecone' as const,
            },
            presenter: {
                type: 'talk',
                source_url: 'https://example.com/presenter',
                voice: { type: 'microsoft', voice_id: 'voice-123' },
            },
        } as Agent;

        mockOptions = {
            auth: { type: 'key', clientKey: 'test-key' },
            callbacks: {
                onError: jest.fn(),
                onNewMessage: jest.fn(),
                onConnectionStateChange: jest.fn(),
                onNewChat: jest.fn(),
                onModeChange: jest.fn(),
                onVideoStateChange: jest.fn(),
                onAgentActivityStateChange: jest.fn(),
                onSrcObjectReady: jest.fn(),
            },
            mode: ChatMode.Functional,
            enableAnalitics: true,
            persistentChat: true,
        };

        mockStreamingManager = {
            streamId: 'stream-123',
            sessionId: 'session-123',
            streamType: StreamType.Legacy,
            interruptAvailable: false,
            speak: jest.fn().mockResolvedValue({ status: 'success', duration: 5000, video_id: 'video-123' }),
            disconnect: jest.fn().mockResolvedValue(undefined),
        };

        mockChat = { id: 'chat-123', chat_mode: ChatMode.Functional };

        mockSocketManager = { disconnect: jest.fn() };

        mockAnalytics = { track: jest.fn(), enrich: jest.fn() };

        mockAgentsApi = {
            getById: jest.fn().mockResolvedValue(mockAgent),
            getSTTToken: jest.fn().mockResolvedValue({ token: 'stt-token' }),
            chat: jest.fn().mockResolvedValue({ result: 'Agent response', context: 'test context', matches: [] }),
            createRating: jest.fn().mockResolvedValue({ id: 'rating-123' }),
            updateRating: jest.fn().mockResolvedValue({ id: 'rating-123' }),
            deleteRating: jest.fn().mockResolvedValue(undefined),
        };

        // Setup mocks
        (createAgentsApi as jest.Mock).mockReturnValue(mockAgentsApi);
        (initializeAnalytics as jest.Mock).mockReturnValue(mockAnalytics);
        (createSocketManager as jest.Mock).mockResolvedValue(mockSocketManager);
        (initializeStreamAndChat as jest.Mock).mockResolvedValue({
            streamingManager: mockStreamingManager,
            chat: mockChat,
        });
        (createMessageEventQueue as jest.Mock).mockReturnValue({ onMessage: jest.fn(), clearQueue: jest.fn() });
        (getInitialMessages as jest.Mock).mockReturnValue([]);
        (createChat as jest.Mock).mockResolvedValue({ chat: mockChat });
        (validateInterrupt as jest.Mock).mockReturnValue(undefined);
        (sendInterrupt as jest.Mock).mockReturnValue(undefined);
    });

    describe('createAgentManager', () => {
        it('should create agent manager successfully', async () => {
            const manager = await createAgentManager('agent-123', mockOptions);

            expect(manager).toBeDefined();
            expect(manager.agent).toEqual(mockAgent);
            expect(manager.starterMessages).toEqual(['Hello!', 'How can I help?']);
            expect(createAgentsApi).toHaveBeenCalledWith(
                mockOptions.auth,
                'https://api.d-id.com',
                mockOptions.callbacks.onError
            );
            expect(mockAgentsApi.getById).toHaveBeenCalledWith('agent-123');
        });

        it('should initialize analytics correctly', async () => {
            await createAgentManager('agent-123', mockOptions);

            expect(initializeAnalytics).toHaveBeenCalledWith({
                token: 'test-mixpanel-key',
                agentId: 'agent-123',
                isEnabled: true,
                distinctId: undefined,
            });
            expect(mockAnalytics.track).toHaveBeenCalledWith('agent-sdk', { event: 'init' });
            expect(mockAnalytics.track).toHaveBeenCalledWith('agent-sdk', expect.objectContaining({ event: 'loaded' }));
        });

        it('should use custom configuration options', async () => {
            const customOptions = {
                ...mockOptions,
                mixpanelKey: 'custom-mixpanel',
                wsURL: 'wss://custom.com',
                baseURL: 'https://custom.com',
                distinctId: 'custom-user',
            };

            await createAgentManager('agent-123', customOptions);

            expect(initializeAnalytics).toHaveBeenCalledWith({
                token: 'custom-mixpanel',
                agentId: 'agent-123',
                isEnabled: true,
                distinctId: 'custom-user',
            });
        });

        it('should handle initial messages correctly', async () => {
            const initialMessages = [
                { id: '1', role: 'user' as const, content: 'Hello', created_at: new Date().toISOString() },
            ];
            (getInitialMessages as jest.Mock).mockReturnValue(initialMessages);

            const customOptions = { ...mockOptions, initialMessages };
            await createAgentManager('agent-123', customOptions);

            expect(getInitialMessages).toHaveBeenCalledWith(customOptions.initialMessages);
            expect(mockOptions.callbacks.onNewMessage).toHaveBeenCalledWith(initialMessages, 'answer');
        });
    });

    describe('AgentManager Methods', () => {
        let manager: AgentManager;

        beforeEach(async () => {
            manager = await createAgentManager('agent-123', mockOptions);
        });

        describe('connect', () => {
            it('should connect successfully', async () => {
                await manager.connect();

                expect(mockOptions.callbacks.onConnectionStateChange).toHaveBeenCalledWith(ConnectionState.Connecting);
                expect(initializeStreamAndChat).toHaveBeenCalled();
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-chat', {
                    event: 'connect',
                    mode: ChatMode.Functional,
                });
            });

            it('should handle new chat creation during connect', async () => {
                const newChat = { id: 'new-chat-456', chat_mode: ChatMode.Functional };
                (initializeStreamAndChat as jest.Mock).mockResolvedValueOnce({
                    streamingManager: mockStreamingManager,
                    chat: newChat,
                });

                await manager.connect();

                expect(mockOptions.callbacks.onNewChat).toHaveBeenCalledWith('new-chat-456');
            });

            it('should handle connection failure', async () => {
                const error = new Error('Connection failed');
                (initializeStreamAndChat as jest.Mock).mockRejectedValueOnce(error);

                await expect(manager.connect()).rejects.toThrow('Connection failed');
                expect(mockOptions.callbacks.onConnectionStateChange).toHaveBeenCalledWith(ConnectionState.Fail);
            });
        });

        describe('reconnect', () => {
            it('should reconnect successfully', async () => {
                await manager.reconnect();

                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-chat', {
                    event: 'reconnect',
                    mode: ChatMode.Functional,
                });
            });
        });

        describe('disconnect', () => {
            it('should disconnect successfully', async () => {
                // First connect
                await manager.connect();

                await manager.disconnect();

                expect(mockSocketManager.disconnect).toHaveBeenCalled();
                expect(mockStreamingManager.disconnect).toHaveBeenCalled();
                expect(mockOptions.callbacks.onConnectionStateChange).toHaveBeenCalledWith(
                    ConnectionState.Disconnected
                );
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-chat', {
                    event: 'disconnect',
                    mode: ChatMode.Functional,
                });
            });
        });

        describe('chat', () => {
            beforeEach(async () => {
                await manager.connect();
            });

            it('should send chat message successfully', async () => {
                const response = await manager.chat('Hello, how are you?');

                expect(mockAgentsApi.chat).toHaveBeenCalledWith(
                    'agent-123',
                    'chat-123',
                    {
                        chatMode: ChatMode.Functional,
                        streamId: 'stream-123',
                        sessionId: 'session-123',
                        messages: expect.arrayContaining([
                            expect.objectContaining({ role: 'user', content: 'Hello, how are you?' }),
                        ]),
                    },
                    expect.any(Object)
                );

                expect(response.result).toBe('Agent response');
                expect(mockOptions.callbacks.onNewMessage).toHaveBeenCalledWith(
                    expect.arrayContaining([
                        expect.objectContaining({ role: 'user', content: 'Hello, how are you?' }),
                        expect.objectContaining({ role: 'assistant', content: 'Agent response' }),
                    ]),
                    'answer'
                );
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-message-send', {
                    event: 'success',
                    messages: expect.any(Number),
                });
            });

            it('should validate chat request - empty message', async () => {
                await expect(manager.chat('')).rejects.toThrow('Message cannot be empty');
            });

            it('should validate chat request - message too long', async () => {
                const longMessage = 'a'.repeat(801);
                await expect(manager.chat(longMessage)).rejects.toThrow('Message cannot be more than 800 characters');
            });

            it('should validate chat request - maintenance mode', async () => {
                await manager.changeMode(ChatMode.Maintenance);
                await expect(manager.chat('Hello')).rejects.toThrow('Chat is in maintenance mode');
            });

            it('should handle chat without existing chat session', async () => {
                // Reset the mock to ensure clean state
                jest.clearAllMocks();

                // Use TextOnly mode which allows chat without streaming manager
                const textOnlyOptions = { ...mockOptions, mode: ChatMode.TextOnly };

                // Mock initializeStreamAndChat to return no chat BEFORE creating manager
                (initializeStreamAndChat as jest.Mock).mockResolvedValueOnce({
                    streamingManager: undefined,
                    chat: undefined,
                });

                // Create fresh manager with no existing chat
                const newManager = await createAgentManager('agent-123', textOnlyOptions);
                await newManager.connect();

                // Now when we chat, it should create a new chat
                await newManager.chat('Hello');

                expect(createChat).toHaveBeenCalled();
            });

            it('should handle chat creation failure', async () => {
                // Reset the mock to ensure clean state
                jest.clearAllMocks();

                // Use TextOnly mode which allows chat without streaming manager
                const textOnlyOptions = { ...mockOptions, mode: ChatMode.TextOnly };

                // Mock initializeStreamAndChat to return no chat BEFORE creating manager
                (initializeStreamAndChat as jest.Mock).mockResolvedValueOnce({
                    streamingManager: undefined,
                    chat: undefined,
                });

                const newManager = await createAgentManager('agent-123', textOnlyOptions);
                await newManager.connect();

                // Mock createChat to fail
                (createChat as jest.Mock).mockResolvedValueOnce({ chat: null });

                await expect(newManager.chat('Hello')).rejects.toThrow('Failed to create persistent chat');
            });

            it('should handle API errors during chat', async () => {
                const apiError = new Error('API Error');
                mockAgentsApi.chat.mockRejectedValueOnce(apiError);

                await expect(manager.chat('Hello')).rejects.toThrow('API Error');
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-message-send', {
                    event: 'error',
                    messages: expect.any(Number),
                });
            });

            it('should handle retry logic for invalid session', async () => {
                const sessionError = new Error('missing or invalid session_id');
                const { retryOperation } = require('../../utils/retry-operation');

                // Mock retryOperation to simulate retry behavior
                (retryOperation as jest.Mock).mockImplementationOnce(async (fn, options) => {
                    try {
                        return await fn();
                    } catch (error) {
                        if (options.shouldRetryFn(error)) {
                            await options.onRetry();
                            return await fn();
                        }
                        throw error;
                    }
                });

                mockAgentsApi.chat
                    .mockRejectedValueOnce(sessionError)
                    .mockResolvedValueOnce({ result: 'Retry success', context: 'test context', matches: [] });

                const response = await manager.chat('Hello');

                expect(response.result).toBe('Retry success');
                expect(mockAgentsApi.chat).toHaveBeenCalledTimes(2);
            });
        });

        describe('speak', () => {
            beforeEach(async () => {
                await manager.connect();
            });

            it('should speak with string input', async () => {
                const result = await manager.speak('Hello world');

                expect(mockStreamingManager.speak).toHaveBeenCalledWith({
                    script: { type: 'text', provider: mockAgent.presenter.voice, input: 'Hello world', ssml: false },
                    metadata: { chat_id: 'chat-123', agent_id: 'agent-123' },
                });

                expect(result.status).toBe('success');
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-speak', expect.any(Object));
            });

            it('should speak with script object', async () => {
                const script = { type: 'text' as const, input: 'Hello world', ssml: true };

                await manager.speak(script);

                expect(mockStreamingManager.speak).toHaveBeenCalledWith({
                    script: { type: 'text', provider: mockAgent.presenter.voice, input: 'Hello world', ssml: true },
                    metadata: { chat_id: 'chat-123', agent_id: 'agent-123' },
                });
            });

            it('should handle textual chat mode', async () => {
                const { isTextualChat } = require('../../utils/chat');
                (isTextualChat as jest.Mock).mockReturnValueOnce(true);

                await manager.changeMode(ChatMode.TextOnly);

                const result = await manager.speak('Hello world');

                expect(result).toEqual({ duration: 0, video_id: '', status: 'success' });
                expect(mockStreamingManager.speak).not.toHaveBeenCalled();
            });

            it('should throw error if not connected', async () => {
                await manager.disconnect();

                await expect(manager.speak('Hello')).rejects.toThrow('Please connect to the agent first');
            });

            it('should throw error if presenter voice is not initialized', async () => {
                const agentWithoutVoice = { ...mockAgent, presenter: { type: 'talk' } };
                mockAgentsApi.getById.mockResolvedValueOnce(agentWithoutVoice);

                const managerWithoutVoice = await createAgentManager('agent-123', mockOptions);
                await managerWithoutVoice.connect();

                await expect(managerWithoutVoice.speak('Hello')).rejects.toThrow('Presenter voice is not initialized');
            });
        });

        describe('interrupt', () => {
            beforeEach(async () => {
                await manager.connect();
            });

            it('should interrupt successfully', async () => {
                // Add a message to interrupt
                await manager.chat('Hello');

                await manager.interrupt({ type: 'click' });

                expect(validateInterrupt).toHaveBeenCalledWith(mockStreamingManager, StreamType.Legacy, null);
                expect(sendInterrupt).toHaveBeenCalledWith(mockStreamingManager, null);
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-video-interrupt', {
                    type: 'click',
                    video_duration_to_interrupt: expect.any(Number),
                    message_duration_to_interrupt: expect.any(Number),
                });
            });
        });

        describe('rate', () => {
            beforeEach(async () => {
                await manager.connect();
                // Create a message by sending a chat message first
                await manager.chat('Hello test');
            });

            it('should create rating successfully', async () => {
                // Get the message ID from the getRandom mock
                const messageId = 'random-id-123';

                const result = await manager.rate(messageId, 1);

                expect(mockAgentsApi.createRating).toHaveBeenCalledWith(
                    'agent-123',
                    'chat-123',
                    expect.objectContaining({
                        knowledge_id: 'knowledge-123',
                        message_id: messageId,
                        score: 1,
                        matches: [],
                    })
                );
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-rate', {
                    event: 'create',
                    thumb: 'up',
                    knowledge_id: 'knowledge-123',
                    matches: [],
                    score: 1,
                });
            });

            it('should update rating successfully', async () => {
                const messageId = 'random-id-123';

                await manager.rate(messageId, -1, 'rating-123');

                expect(mockAgentsApi.updateRating).toHaveBeenCalledWith(
                    'agent-123',
                    'chat-123',
                    'rating-123',
                    expect.objectContaining({ knowledge_id: 'knowledge-123', message_id: messageId, score: -1 })
                );
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-rate', {
                    event: 'update',
                    thumb: 'down',
                    knowledge_id: 'knowledge-123',
                    matches: [],
                    score: -1,
                });
            });

            it('should throw error if chat not initialized', async () => {
                // Reset mocks to ensure clean state
                jest.clearAllMocks();

                // Mock initializeStreamAndChat to return no chat
                (initializeStreamAndChat as jest.Mock).mockResolvedValue({
                    streamingManager: mockStreamingManager,
                    chat: undefined,
                });

                // Create a manager and connect, but ensure no chat is set
                const newManager = await createAgentManager('agent-123', mockOptions);
                await newManager.connect();

                expect(() => newManager.rate('message-id', 1)).toThrow('Chat is not initialized');
            });

            it('should throw error if message not found', async () => {
                expect(() => manager.rate('non-existent-id', 1)).toThrow('Message not found');
            });
        });

        describe('deleteRate', () => {
            beforeEach(async () => {
                await manager.connect();
            });

            it('should delete rating successfully', async () => {
                await manager.deleteRate('rating-123');

                expect(mockAgentsApi.deleteRating).toHaveBeenCalledWith('agent-123', 'chat-123', 'rating-123');
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-rate-delete', { type: 'text' });
            });

            it('should throw error if chat not initialized', async () => {
                // Reset mocks to ensure clean state
                jest.clearAllMocks();

                // Mock initializeStreamAndChat to return no chat
                (initializeStreamAndChat as jest.Mock).mockResolvedValue({
                    streamingManager: mockStreamingManager,
                    chat: undefined,
                });

                // Create a manager and connect, but ensure no chat is set
                const newManager = await createAgentManager('agent-123', mockOptions);
                await newManager.connect();

                expect(() => newManager.deleteRate('rating-123')).toThrow('Chat is not initialized');
            });
        });

        describe('changeMode', () => {
            it('should change mode successfully', async () => {
                await manager.changeMode(ChatMode.TextOnly);

                expect(mockOptions.callbacks.onModeChange).toHaveBeenCalledWith(ChatMode.TextOnly);
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-mode-change', { mode: ChatMode.TextOnly });
            });

            it('should disconnect when changing to non-functional mode', async () => {
                await manager.connect();

                await manager.changeMode(ChatMode.TextOnly);

                expect(mockSocketManager.disconnect).toHaveBeenCalled();
                expect(mockStreamingManager.disconnect).toHaveBeenCalled();
            });

            it('should not change if mode is the same', async () => {
                const trackCallsBefore = mockAnalytics.track.mock.calls.length;

                await manager.changeMode(ChatMode.Functional);

                expect(mockAnalytics.track.mock.calls.length).toBe(trackCallsBefore);
                expect(mockOptions.callbacks.onModeChange).not.toHaveBeenCalled();
            });
        });

        describe('getters', () => {
            beforeEach(async () => {
                await manager.connect();
            });

            it('should get stream type', () => {
                expect(manager.getStreamType()).toBe(StreamType.Legacy);
            });

            it('should get interrupt availability', () => {
                expect(manager.getIsInterruptAvailable()).toBe(false);
            });

            it('should get STT token', async () => {
                const token = await manager.getSTTToken();
                expect(token).toEqual({ token: 'stt-token' });
                expect(mockAgentsApi.getSTTToken).toHaveBeenCalledWith('agent-123');
            });
        });
    });

    describe('DirectPlayback mode', () => {
        it('should not create socket manager in DirectPlayback mode', async () => {
            const directPlaybackOptions = { ...mockOptions, mode: ChatMode.DirectPlayback };

            await createAgentManager('agent-123', directPlaybackOptions);

            expect(createSocketManager).not.toHaveBeenCalled();
        });
    });

    describe('Error handling', () => {
        it('should handle agent fetch error', async () => {
            const error = new Error('Agent not found');
            mockAgentsApi.getById.mockRejectedValueOnce(error);

            await expect(createAgentManager('invalid-agent', mockOptions)).rejects.toThrow('Agent not found');
        });

        it('should handle analytics initialization with disabled analytics', async () => {
            const optionsWithoutAnalytics = { ...mockOptions, enableAnalitics: false };

            await createAgentManager('agent-123', optionsWithoutAnalytics);

            expect(initializeAnalytics).toHaveBeenCalledWith({
                token: 'test-mixpanel-key',
                agentId: 'agent-123',
                isEnabled: false,
                distinctId: undefined,
            });
        });
    });
});

describe('getAgent', () => {
    let mockAgentsApi: any;

    beforeEach(() => {
        mockAgentsApi = { getById: jest.fn().mockResolvedValue({ id: 'agent-123', name: 'Test Agent' }) };
        (createAgentsApi as jest.Mock).mockReturnValue(mockAgentsApi);
    });

    it('should get agent by ID', async () => {
        const auth = { type: 'key' as const, clientKey: 'test-key', externalId: 'user-123' };
        const agent = await getAgent('agent-123', auth);

        expect(createAgentsApi).toHaveBeenCalledWith(auth, 'https://api.d-id.com');
        expect(mockAgentsApi.getById).toHaveBeenCalledWith('agent-123');
        expect(agent).toEqual({ id: 'agent-123', name: 'Test Agent' });
    });

    it('should use custom baseURL', async () => {
        const auth = { type: 'key' as const, clientKey: 'test-key', externalId: 'user-123' };
        const customBaseURL = 'https://custom-api.com';

        await getAgent('agent-123', auth, customBaseURL);

        expect(createAgentsApi).toHaveBeenCalledWith(auth, customBaseURL);
    });
});
