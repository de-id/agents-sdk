import { MAX_CHAT_MESSAGE_LENGTH } from '@sdk/config/consts';
import { InternalDataChannelTopic } from '@sdk/types/stream/data-channel';
import { createAgentsApi } from '../../api/agents';
import { ValidationError } from '../../errors';
import {
    AgentFactory,
    AgentManagerOptionsFactory,
    AgentsApiFactory,
    AnalyticsFactory,
    ChatFactory,
    SocketManagerFactory,
    StreamingManagerFactory,
} from '../../test-utils/factories';
import {
    Agent,
    AgentManager,
    AgentManagerOptions,
    AvatarType,
    ChatMode,
    ConnectionState,
    DataChannelTopic,
    Providers,
    StreamEndReason,
    StreamType,
} from '../../types';
import { isChatModeWithoutChat, isTextualChat } from '../../utils/chat';
import { initializeAnalytics } from '../analytics/mixpanel';
import { createChat } from '../chat';
import { getInitialMessages } from '../chat/intial-messages';
import { createSocketManager } from '../socket-manager';
import { createMessageEventQueue } from '../socket-manager/message-queue';
import { initializeStreamAndChat } from './connect-to-manager';
import { createAgentManager } from './index';

// Mock all dependencies
jest.mock('../../api/agents');
jest.mock('../analytics/mixpanel');
jest.mock('../socket-manager');
jest.mock('./connect-to-manager');
jest.mock('../socket-manager/message-queue');
jest.mock('../streaming-manager/livekit-manager', () => ({
    ...jest.requireActual('../streaming-manager/livekit-manager'),
    preloadLiveKit: jest.fn(),
}));
jest.mock('../chat/intial-messages');
jest.mock('../chat');
jest.mock('../../utils/retry-operation', () => ({ retryOperation: jest.fn(fn => fn()) }));
jest.mock('../../utils', () => ({ getRandom: jest.fn(() => 'random-id-123') }));
jest.mock('../../utils/chat', () => ({
    isChatModeWithoutChat: jest.fn(() => false),
    isTextualChat: jest.fn(() => false),
}));
jest.mock('../../utils/analytics', () => ({
    getAgentInfo: jest.fn(() => ({ agentType: 'talk' })),
    getAnalyticsInfo: jest.fn(() => ({ agentType: 'talk' })),
    getErrorMessage: jest.requireActual('../../utils/analytics').getErrorMessage,
}));
jest.mock('../../utils/defer', () => ({
    defer: jest.fn(fn => fn()),
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
jest.mock('../../config/consts', () => ({
    ...jest.requireActual('../../config/consts'),
    CONNECTION_RETRY_TIMEOUT_MS: 5000,
}));

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
            ...AgentFactory.build(),
            starter_message: ['Hello!', 'How can I help?'],
            avatar: { type: AvatarType.Talk, voice: { language: 'en-US' } },
        } as Agent;
        mockOptions = AgentManagerOptionsFactory.build();
        mockStreamingManager = StreamingManagerFactory.build({ streamType: StreamType.Legacy });
        mockChat = ChatFactory.build();
        mockSocketManager = SocketManagerFactory.build();
        mockAnalytics = AnalyticsFactory.build();
        mockAgentsApi = AgentsApiFactory.build({ getRuntimeById: jest.fn().mockResolvedValue(mockAgent) });

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
                // the SDK's own analytics wrapper, on its copy of the callbacks
                expect.any(Function),
                undefined
            );
            expect(mockAgentsApi.getRuntimeById).toHaveBeenCalledWith('agent-123');
        });

        it('should initialize analytics correctly', async () => {
            await createAgentManager('agent-123', mockOptions);

            expect(initializeAnalytics).toHaveBeenCalledWith({
                token: 'test-mixpanel-key',
                agentId: 'agent-123',
                isEnabled: true,
                externalId: undefined,
            });
            expect(mockAnalytics.track).toHaveBeenCalledWith('agent-sdk', { event: 'init' }, expect.any(Number));
            expect(mockAnalytics.track).toHaveBeenCalledWith(
                'agent-sdk',
                expect.objectContaining({ event: 'loaded' }),
                expect.any(Number)
            );
        });

        it('should use custom configuration options', async () => {
            const customOptions = {
                ...mockOptions,
                analytics: { mixpanelKey: 'custom-mixpanel' },
                wsURL: 'wss://custom.com',
                baseURL: 'https://custom.com',
                externalId: 'custom-user',
            };

            await createAgentManager('agent-123', customOptions);

            expect(initializeAnalytics).toHaveBeenCalledWith({
                token: 'custom-mixpanel',
                agentId: 'agent-123',
                isEnabled: undefined,
                externalId: 'custom-user',
                mixpanelAdditionalProperties: undefined,
            });
        });

        describe('onSrcObjectReady', () => {
            const withoutSrcObjectReady = () => {
                const { onSrcObjectReady, ...callbacks } = mockOptions.callbacks;
                return { ...mockOptions, callbacks };
            };

            afterEach(() => {
                (isTextualChat as jest.Mock).mockImplementation(() => false);
            });

            it.each([ChatMode.TextOnly, ChatMode.Playground, ChatMode.Maintenance])(
                'should create a manager without it in %s',
                async mode => {
                    (isTextualChat as jest.Mock).mockImplementation(m =>
                        [ChatMode.TextOnly, ChatMode.Playground, ChatMode.Maintenance].includes(m)
                    );

                    const manager = await createAgentManager('agent-123', { ...withoutSrcObjectReady(), mode });

                    expect(manager).toBeDefined();
                }
            );

            it.each([ChatMode.Functional, ChatMode.Off, ChatMode.DirectPlayback])(
                'should reject without it in %s, which streams video',
                async mode => {
                    await expect(createAgentManager('agent-123', { ...withoutSrcObjectReady(), mode })).rejects.toThrow(
                        ValidationError
                    );
                    await expect(createAgentManager('agent-123', { ...withoutSrcObjectReady(), mode })).rejects.toThrow(
                        'callbacks.onSrcObjectReady is required'
                    );
                }
            );

            it('should reject connect() when changeMode moves a text-only manager into a video mode', async () => {
                (isTextualChat as jest.Mock).mockImplementation(m =>
                    [ChatMode.TextOnly, ChatMode.Playground, ChatMode.Maintenance].includes(m)
                );
                const manager = await createAgentManager('agent-123', {
                    ...withoutSrcObjectReady(),
                    mode: ChatMode.TextOnly,
                });

                await manager.changeMode(ChatMode.Functional);

                await expect(manager.connect()).rejects.toThrow('callbacks.onSrcObjectReady is required');
                expect(initializeStreamAndChat).not.toHaveBeenCalled();
            });

            it('should not reach the Agents API when it is missing', async () => {
                await expect(createAgentManager('agent-123', withoutSrcObjectReady())).rejects.toThrow(ValidationError);

                expect(mockAgentsApi.getRuntimeById).not.toHaveBeenCalled();
            });
        });

        it('should hand out a copy of the starter messages, not the agent entity array', async () => {
            const manager = await createAgentManager('agent-123', mockOptions);

            expect(manager.starterMessages).toEqual(['Hello!', 'How can I help?']);
            expect(manager.starterMessages).not.toBe(mockAgent.starter_message);

            // The `readonly` is type-level; the copy is what keeps a write off the agent.
            // @ts-expect-error `starterMessages` is a readonly array.
            manager.starterMessages.push('mutated');
            expect(manager.agent.starter_message).toEqual(['Hello!', 'How can I help?']);

            // @ts-expect-error `agent` is a readonly property.
            manager.agent = {} as Agent;
        });

        it('should give an agent with no starter messages an empty array', async () => {
            delete mockAgent.starter_message;

            const manager = await createAgentManager('agent-123', mockOptions);

            expect(manager.starterMessages).toEqual([]);
        });

        it('should read the three analytics settings from the grouped option', async () => {
            await createAgentManager('agent-123', {
                ...mockOptions,
                analytics: { enabled: false, mixpanelKey: 'own-project', additionalProperties: { plan: 'pro' } },
            });

            expect(initializeAnalytics).toHaveBeenCalledWith({
                token: 'own-project',
                agentId: 'agent-123',
                isEnabled: false,
                externalId: undefined,
                mixpanelAdditionalProperties: { plan: 'pro' },
            });
        });

        describe('modes without a chat on Expressive (V4) agents', () => {
            const unsupported = 'ChatMode.Off and ChatMode.DirectPlayback are not supported for Expressive agents';

            beforeEach(() => {
                (isChatModeWithoutChat as jest.Mock).mockImplementation(mode =>
                    [ChatMode.DirectPlayback, ChatMode.Off].includes(mode)
                );
            });

            afterEach(() => {
                (isChatModeWithoutChat as jest.Mock).mockImplementation(() => false);
            });

            it.each([ChatMode.Off, ChatMode.DirectPlayback])('should reject %s on an expressive agent', async mode => {
                mockAgent.avatar = { type: AvatarType.Expressive, voice: { language: 'en-US' } };

                await expect(createAgentManager('agent-123', { ...mockOptions, mode })).rejects.toThrow(
                    ValidationError
                );
                await expect(createAgentManager('agent-123', { ...mockOptions, mode })).rejects.toThrow(unsupported);
            });

            it('should still create the manager for a talks agent in ChatMode.Off', async () => {
                const manager = await createAgentManager('agent-123', { ...mockOptions, mode: ChatMode.Off });

                expect(manager).toBeDefined();
            });

            it('should reject changeMode to a mode without a chat on an expressive agent', async () => {
                mockAgent.avatar = { type: AvatarType.Expressive, voice: { language: 'en-US' } };
                const manager = await createAgentManager('agent-123', mockOptions);

                await expect(manager.changeMode(ChatMode.DirectPlayback)).rejects.toThrow(ValidationError);
            });

            it('should allow changeMode to a mode without a chat on a talks agent', async () => {
                const manager = await createAgentManager('agent-123', mockOptions);

                await expect(manager.changeMode(ChatMode.Off)).resolves.toBeUndefined();
            });

            it('should ignore an unsupported mode the server reports for the chat', async () => {
                mockAgent.avatar = { type: AvatarType.Expressive, voice: { language: 'en-US' } };
                (initializeStreamAndChat as jest.Mock).mockResolvedValue({
                    streamingManager: mockStreamingManager,
                    chat: { ...mockChat, chat_mode: ChatMode.Off },
                });
                const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
                const manager = await createAgentManager('agent-123', mockOptions);

                await expect(manager.connect()).resolves.toBeUndefined();

                expect(mockOptions.callbacks.onModeChange).not.toHaveBeenCalledWith(ChatMode.Off);
                expect(warn).toHaveBeenCalled();
                warn.mockRestore();
            });
        });

        describe('the chat and connect guards read the current mode', () => {
            beforeEach(() => {
                (isChatModeWithoutChat as jest.Mock).mockImplementation(mode =>
                    [ChatMode.DirectPlayback, ChatMode.Off].includes(mode)
                );
            });

            afterEach(() => {
                (isChatModeWithoutChat as jest.Mock).mockImplementation(() => false);
            });

            it('should allow chat after changeMode moves a session out of Off', async () => {
                const manager = await createAgentManager('agent-123', { ...mockOptions, mode: ChatMode.Off });

                await manager.changeMode(ChatMode.Functional);
                await manager.connect();

                await expect(manager.chat('Hello')).resolves.toBeDefined();
            });

            it('should open the notifications web socket on connect once the mode allows chat', async () => {
                const manager = await createAgentManager('agent-123', {
                    ...mockOptions,
                    mode: ChatMode.DirectPlayback,
                });

                await manager.changeMode(ChatMode.Functional);
                await manager.connect();

                expect(createSocketManager).toHaveBeenCalled();
            });

            it('should tear the session down when a connected DirectPlayback session moves to Functional', async () => {
                // A DirectPlayback session has no notifications web socket and no chat, so it
                // cannot carry a conversation: `connect()` has to run again for the new mode.
                (initializeStreamAndChat as jest.Mock).mockResolvedValueOnce({
                    streamingManager: mockStreamingManager,
                    chat: undefined,
                });
                const manager = await createAgentManager('agent-123', {
                    ...mockOptions,
                    mode: ChatMode.DirectPlayback,
                });
                await manager.connect();
                expect(createSocketManager).not.toHaveBeenCalled();

                await manager.changeMode(ChatMode.Functional);

                expect(mockStreamingManager.disconnect).toHaveBeenCalled();
                await expect(manager.chat('Hello')).rejects.toThrow('Streaming manager is not initialized');

                // …and connecting again builds the session the new mode needs.
                await manager.connect();
                expect(createSocketManager).toHaveBeenCalled();
            });

            it('should tear the session down when a connected Off session moves to Functional', async () => {
                // Off keeps the notifications web socket but creates no chat, so a Functional
                // session built out of it would accept `chat()` with nothing to send it to.
                (isChatModeWithoutChat as jest.Mock).mockImplementation(mode =>
                    [ChatMode.DirectPlayback, ChatMode.Off].includes(mode)
                );
                (initializeStreamAndChat as jest.Mock).mockResolvedValueOnce({
                    streamingManager: mockStreamingManager,
                    chat: undefined,
                });
                const manager = await createAgentManager('agent-123', { ...mockOptions, mode: ChatMode.Off });
                await manager.connect();
                expect(createSocketManager).toHaveBeenCalled();
                expect(mockStreamingManager.disconnect).not.toHaveBeenCalled();

                await manager.changeMode(ChatMode.Functional);

                expect(mockStreamingManager.disconnect).toHaveBeenCalled();
                (isChatModeWithoutChat as jest.Mock).mockImplementation(() => false);
            });

            it('should not tear an Expressive (V4) session down at the end of connect', async () => {
                // A V4 session never has a notifications web socket, so `sessionSupports` must not
                // ask for one: dropping the `!isStreamsV2` guard would disconnect every V4 session
                // whose connect ends in a real mode transition. The session is asked for in
                // TextOnly and the synthesised chat answers Functional — what
                // `initializeStreamAndChat` really builds for V4 — so the tail reaches
                // `sessionSupports` instead of returning early on an unchanged mode.
                mockAgent.avatar = { type: AvatarType.Expressive, voice: { language: 'en-US' } };
                (initializeStreamAndChat as jest.Mock).mockResolvedValueOnce({
                    streamingManager: mockStreamingManager,
                    chat: { ...mockChat, chat_mode: ChatMode.Functional },
                });
                const manager = await createAgentManager('agent-123', { ...mockOptions, mode: ChatMode.TextOnly });

                await manager.connect();

                expect(manager.getChatMode()).toBe(ChatMode.Functional);
                expect(createSocketManager).not.toHaveBeenCalled();
                expect(mockStreamingManager.disconnect).not.toHaveBeenCalled();
                expect(mockOptions.callbacks.onModeChange).toHaveBeenCalledWith(ChatMode.Functional);
            });

            it('should keep a connected TextOnly session that already has a socket and a chat', async () => {
                // The chat reports TextOnly, so the `connect()` tail leaves the mode alone and the
                // `changeMode()` below is the real transition rather than a no-op.
                (initializeStreamAndChat as jest.Mock).mockResolvedValueOnce({
                    streamingManager: mockStreamingManager,
                    chat: { ...mockChat, chat_mode: ChatMode.TextOnly },
                });
                const manager = await createAgentManager('agent-123', { ...mockOptions, mode: ChatMode.TextOnly });
                await manager.connect();
                expect(manager.getChatMode()).toBe(ChatMode.TextOnly);

                await manager.changeMode(ChatMode.Functional);

                expect(manager.getChatMode()).toBe(ChatMode.Functional);
                expect(mockStreamingManager.disconnect).not.toHaveBeenCalled();
            });

            it('should not report a disconnect for a session that was never opened', async () => {
                const manager = await createAgentManager('agent-123', { ...mockOptions, mode: ChatMode.Off });

                await manager.changeMode(ChatMode.Functional);

                expect(mockOptions.callbacks.onConnectionStateChange).not.toHaveBeenCalled();
            });

            it('should reject chat after changeMode moves a session into Off', async () => {
                const manager = await createAgentManager('agent-123', mockOptions);
                await manager.connect();

                await manager.changeMode(ChatMode.Off);

                await expect(manager.chat('Hello')).rejects.toThrow('Off is enabled, chat is disabled');
            });
        });

        describe("the caller's options object is read, never written", () => {
            it('should leave callbacks.onError and debug as the caller set them', async () => {
                const onError = mockOptions.callbacks.onError;

                await createAgentManager('agent-123', mockOptions);
                await createAgentManager('agent-456', mockOptions);

                expect(mockOptions.callbacks.onError).toBe(onError);
                expect(mockOptions.debug).toBeUndefined();
            });

            it('should deliver an error once per manager when two share one options object', async () => {
                mockAgent.advanced_settings = { ui_debug_mode: true } as any;
                const onError = mockOptions.callbacks.onError as jest.Mock;

                await createAgentManager('agent-123', mockOptions);
                await createAgentManager('agent-456', mockOptions);

                const handlers = (createAgentsApi as jest.Mock).mock.calls.map(call => call[2]);
                expect(handlers).toHaveLength(2);

                const failure = new Error('boom');
                handlers[1](failure);

                expect(onError).toHaveBeenCalledTimes(1);
                expect(onError).toHaveBeenCalledWith(failure, undefined);
                expect(
                    mockAnalytics.track.mock.calls.filter(([event]: [string]) => event === 'agent-error')
                ).toHaveLength(1);
            });
        });

        it('should handle initial messages correctly', async () => {
            const initialMessages = [
                { id: '1', role: 'user' as const, content: 'Hello', parts: [], createdAt: new Date().toISOString() },
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

        describe('state getters', () => {
            // The callbacks the streaming manager is actually handed: the SDK's own copy, wrappers
            // included. Reporting through them is what a real session does.
            const streamCallbacks = () => (initializeStreamAndChat as jest.Mock).mock.calls[0][1].callbacks;

            it('should report the creation-time chat mode before connect', async () => {
                expect(manager.getChatMode()).toBe(ChatMode.Functional);

                const textOnly = await createAgentManager('agent-123', { ...mockOptions, mode: ChatMode.TextOnly });
                expect(textOnly.getChatMode()).toBe(ChatMode.TextOnly);
            });

            it('should follow changeMode', async () => {
                await manager.changeMode(ChatMode.TextOnly);

                expect(manager.getChatMode()).toBe(ChatMode.TextOnly);
                expect(mockOptions.callbacks.onModeChange).toHaveBeenCalledWith(ChatMode.TextOnly);
            });

            it('should adopt the mode the server answered connect with', async () => {
                (initializeStreamAndChat as jest.Mock).mockResolvedValueOnce({
                    streamingManager: mockStreamingManager,
                    chat: { ...mockChat, chat_mode: ChatMode.Maintenance },
                });

                await manager.connect();

                expect(manager.getChatMode()).toBe(ChatMode.Maintenance);
                // Once, and from `applyMode` — the mode and the callback cannot disagree.
                expect(mockOptions.callbacks.onModeChange).toHaveBeenCalledTimes(1);
                expect(mockOptions.callbacks.onModeChange).toHaveBeenCalledWith(ChatMode.Maintenance);
            });

            it('should fall back to Maintenance when connecting fails', async () => {
                (initializeStreamAndChat as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

                await expect(manager.connect()).rejects.toThrow('Connection failed');

                expect(manager.getChatMode()).toBe(ChatMode.Maintenance);
            });

            it('should report New before connect and follow every state reported afterwards', async () => {
                expect(manager.getConnectionState()).toBe(ConnectionState.New);

                await manager.connect();
                expect(manager.getConnectionState()).toBe(ConnectionState.Connecting);

                streamCallbacks().onConnectionStateChange(ConnectionState.Connected);
                expect(manager.getConnectionState()).toBe(ConnectionState.Connected);
                expect(mockOptions.callbacks.onConnectionStateChange).toHaveBeenCalledWith(
                    ConnectionState.Connected,
                    undefined
                );

                // A reason reported with the state reaches the caller alongside it.
                streamCallbacks().onConnectionStateChange(ConnectionState.Disconnected, StreamEndReason.Inactivity);
                expect(manager.getConnectionState()).toBe(ConnectionState.Disconnected);
                expect(mockOptions.callbacks.onConnectionStateChange).toHaveBeenCalledWith(
                    ConnectionState.Disconnected,
                    StreamEndReason.Inactivity
                );

                await manager.disconnect();
                expect(manager.getConnectionState()).toBe(ConnectionState.Disconnected);
            });

            it('should return the session ids onStreamCreated delivered, and drop them on disconnect', async () => {
                expect(manager.getSessionInfo()).toBeUndefined();

                await manager.connect();
                expect(manager.getSessionInfo()).toBeUndefined();

                const info = { streamId: 'str_1', sessionId: 'ses_1', agentId: 'agent-123' };
                streamCallbacks().onStreamCreated(info);

                expect(manager.getSessionInfo()).toEqual(info);
                expect(mockOptions.callbacks.onStreamCreated).toHaveBeenCalledWith(info);

                await manager.disconnect();
                expect(manager.getSessionInfo()).toBeUndefined();
            });
        });

        describe('connect', () => {
            it('should connect successfully', async () => {
                await manager.connect();

                expect(mockOptions.callbacks.onConnectionStateChange).toHaveBeenCalledWith(
                    ConnectionState.Connecting,
                    undefined
                );
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
                expect(mockOptions.callbacks.onConnectionStateChange).toHaveBeenCalledWith(
                    ConnectionState.Fail,
                    undefined
                );
            });

            describe('is idempotent', () => {
                // Holds the stream/chat init open so a second call lands while the first is still in
                // flight; the returned function lets it resolve.
                function deferStreamAndChat() {
                    let release: (value: any) => void = () => {};
                    (initializeStreamAndChat as jest.Mock).mockReturnValueOnce(
                        new Promise(resolve => {
                            release = resolve;
                        })
                    );

                    return () => release({ streamingManager: mockStreamingManager, chat: mockChat });
                }

                it('should return the in-flight promise instead of opening a second session', async () => {
                    const release = deferStreamAndChat();

                    const first = manager.connect();
                    const second = manager.connect();

                    release();
                    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);

                    expect(initializeStreamAndChat).toHaveBeenCalledTimes(1);
                });

                it('should reject a second connect once a session is open', async () => {
                    await manager.connect();

                    const rejection = expect(manager.connect()).rejects;
                    await rejection.toThrow(ValidationError);
                    await rejection.toThrow('Already connected; call disconnect() first');
                    expect(initializeStreamAndChat).toHaveBeenCalledTimes(1);
                });

                it('should connect again after disconnect', async () => {
                    await manager.connect();
                    await manager.disconnect();

                    await expect(manager.connect()).resolves.toBeUndefined();
                    expect(initializeStreamAndChat).toHaveBeenCalledTimes(2);
                });

                it('should clear the guard when a connect fails, so a retry works', async () => {
                    (initializeStreamAndChat as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

                    await expect(manager.connect()).rejects.toThrow('Connection failed');
                    await expect(manager.connect()).resolves.toBeUndefined();

                    expect(initializeStreamAndChat).toHaveBeenCalledTimes(2);
                });

                it("should give a joining caller the first attempt's rejection", async () => {
                    let reject: (error: Error) => void = () => {};
                    (initializeStreamAndChat as jest.Mock).mockReturnValueOnce(
                        new Promise((_resolve, r) => {
                            reject = r;
                        })
                    );

                    const first = manager.connect();
                    const second = manager.connect();

                    reject(new Error('Connection failed'));

                    await expect(first).rejects.toThrow('Connection failed');
                    await expect(second).rejects.toThrow('Connection failed');
                    expect(initializeStreamAndChat).toHaveBeenCalledTimes(1);
                });

                it('should join the attempt a reconnect already has in flight', async () => {
                    await manager.connect();

                    const release = deferStreamAndChat();
                    (initializeStreamAndChat as jest.Mock).mockClear();

                    const reconnecting = manager.reconnect();
                    // Let the reconnect tear the old session down and start its own connect; the
                    // window this closes is a public connect() landing after that teardown.
                    await new Promise(resolve => setTimeout(resolve, 0));
                    const connecting = manager.connect();

                    release();
                    await Promise.all([reconnecting, connecting]);

                    // One session, not two: the public connect joined the reconnect's attempt.
                    expect(initializeStreamAndChat).toHaveBeenCalledTimes(1);
                });

                it('should disconnect without waiting for an in-flight connect', async () => {
                    const release = deferStreamAndChat();

                    const connecting = manager.connect();
                    // Let the connect get as far as waiting on the stream.
                    await new Promise(resolve => setTimeout(resolve, 0));

                    // Resolves while the connect is still pending: a connect is bounded by three
                    // 45-second attempts and a web socket with no timeout, and an unmount handler
                    // must not inherit that.
                    await manager.disconnect();
                    expect(mockStreamingManager.disconnect).not.toHaveBeenCalled();

                    release();
                    await connecting;

                    // The session the connect went on to open is torn down, not left running.
                    expect(mockStreamingManager.disconnect).toHaveBeenCalled();
                    expect(manager.getConnectionState()).toBe(ConnectionState.Disconnected);
                    expect(manager.getSessionInfo()).toBeUndefined();
                    await expect(manager.connect()).resolves.toBeUndefined();
                });

                it('should not open a session when a disconnect lands during a reconnect', async () => {
                    // The window the in-flight guard used to leave open: on an Expressive (V4) agent
                    // the transport is asked to reconnect first, and nothing was in flight while that
                    // ran — so a `disconnect()` resolved on a session the fallback then replaced.
                    mockAgent.avatar = { type: AvatarType.Expressive, voice: { language: 'en-US' } };
                    mockStreamingManager.reconnect = jest.fn();
                    const expressive = await createAgentManager('agent-123', mockOptions);
                    await expressive.connect();

                    let failTransport: (error: Error) => void = () => {};
                    mockStreamingManager.reconnect.mockReturnValueOnce(
                        new Promise((_resolve, reject) => {
                            failTransport = reject;
                        })
                    );
                    (initializeStreamAndChat as jest.Mock).mockClear();

                    const reconnecting = expressive.reconnect();
                    await new Promise(resolve => setTimeout(resolve, 0));

                    await expressive.disconnect();
                    failTransport(new Error('transport gone'));
                    await reconnecting;

                    // The fallback connect does not run, so no second session is opened.
                    expect(initializeStreamAndChat).not.toHaveBeenCalled();
                    expect(expressive.getConnectionState()).toBe(ConnectionState.Disconnected);
                    expect(mockAnalytics.track).toHaveBeenCalledWith(
                        'agent-chat',
                        expect.objectContaining({ event: 'reconnect', success: false })
                    );
                });

                it('should join the attempt when a callback calls connect() from inside connect()', async () => {
                    let reentrant: Promise<void> | undefined;
                    let reentrantManager: AgentManager | undefined;
                    const options = {
                        ...mockOptions,
                        callbacks: {
                            ...mockOptions.callbacks,
                            onConnectionStateChange: jest.fn((state: ConnectionState) => {
                                if (state === ConnectionState.Connecting && !reentrant) {
                                    reentrant = reentrantManager?.connect();
                                }
                            }),
                        },
                    };
                    reentrantManager = await createAgentManager('agent-123', options);
                    (initializeStreamAndChat as jest.Mock).mockClear();

                    await reentrantManager.connect();
                    await reentrant;

                    // The guard is published before `connect()` runs its synchronous prefix, so the
                    // handler's call joined the attempt instead of opening a second session.
                    expect(initializeStreamAndChat).toHaveBeenCalledTimes(1);
                });

                it('should keep the session a DirectPlayback reconnect just built', async () => {
                    // The chat is carried over from the earlier Functional connect and still says
                    // `Functional`, but it says nothing about *this* session — which is a
                    // DirectPlayback one and therefore has no notifications web socket. Reading the
                    // mode off it made the tail tear down the session it had just built, while
                    // `reconnect()` reported success.
                    await manager.connect();
                    await manager.changeMode(ChatMode.DirectPlayback);
                    mockStreamingManager.disconnect.mockClear();
                    (createSocketManager as jest.Mock).mockClear();

                    await manager.reconnect();

                    expect(manager.getChatMode()).toBe(ChatMode.DirectPlayback);
                    expect(createSocketManager).not.toHaveBeenCalled();
                    // The session the reconnect just opened is still there.
                    expect(mockStreamingManager.disconnect).not.toHaveBeenCalled();
                    expect(manager.getStreamType()).toBe(StreamType.Legacy);
                    expect(mockAnalytics.track).toHaveBeenCalledWith(
                        'agent-chat',
                        expect.objectContaining({ event: 'reconnect', success: true })
                    );
                });

                it('should reject reconnect while a connect is in flight', async () => {
                    const release = deferStreamAndChat();

                    const connecting = manager.connect();
                    const reconnecting = manager.reconnect();

                    await expect(reconnecting).rejects.toThrow(
                        'A connect() is in flight; wait for it before calling reconnect()'
                    );

                    release();
                    await connecting;
                });
            });
        });

        describe('reconnect', () => {
            it('should reconnect successfully and check inner actions', async () => {
                // First connect to establish initial state
                await manager.connect();

                // Clear previous analytics calls
                mockAnalytics.track.mockClear();

                await manager.reconnect();

                // Verify analytics tracking for reconnect event
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-chat', {
                    event: 'reconnect',
                    mode: ChatMode.Functional,
                    success: true,
                });

                // Verify that the streaming manager and socket manager have disconnect methods
                expect(typeof mockStreamingManager.disconnect).toBe('function');
                expect(typeof mockSocketManager.disconnect).toBe('function');
            });

            it('should handle reconnect failure during disconnect', async () => {
                // First connect to establish initial state
                await manager.connect();

                // Make streaming manager disconnect fail
                mockStreamingManager.disconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

                await expect(manager.reconnect()).rejects.toThrow('Disconnect failed');
                expect(mockAnalytics.track).not.toHaveBeenCalledWith(
                    'agent-chat',
                    expect.objectContaining({ event: 'reconnect' })
                );
            });

            it('should handle reconnect failure during connect', async () => {
                // First connect to establish initial state
                await manager.connect();

                // Make initializeStreamAndChat fail on reconnect
                (initializeStreamAndChat as jest.Mock).mockRejectedValueOnce(new Error('Connect failed'));

                await expect(manager.reconnect()).rejects.toThrow('Connect failed');
                expect(mockAnalytics.track).not.toHaveBeenCalledWith(
                    'agent-chat',
                    expect.objectContaining({ event: 'reconnect' })
                );
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
                    ConnectionState.Disconnected,
                    undefined
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

            it('should populate parts on user message', async () => {
                const mockCallback = mockOptions.callbacks.onNewMessage as jest.Mock;
                mockCallback.mockClear();

                await manager.chat('Hello, how are you?');

                // First call is the user message
                const [userMessages] = mockCallback.mock.calls[0];
                const userMsg = userMessages[userMessages.length - 1];
                expect(userMsg.parts).toEqual([{ type: 'text', text: 'Hello, how are you?' }]);
            });

            it('should populate parts on assistant response message', async () => {
                const mockCallback = mockOptions.callbacks.onNewMessage as jest.Mock;
                mockCallback.mockClear();

                await manager.chat('Hello, how are you?');

                // Second call is the answer
                const [answerMessages] = mockCallback.mock.calls[1];
                const assistantMsg = answerMessages[answerMessages.length - 1];
                expect(assistantMsg.parts).toEqual([{ type: 'text', text: 'Agent response' }]);
            });

            it('should validate chat request - empty message', async () => {
                await expect(manager.chat('')).rejects.toThrow('Message cannot be empty');
            });

            it('should validate chat request - message too long', async () => {
                const longMessage = 'a'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1);
                await expect(manager.chat(longMessage)).rejects.toThrow(
                    `Message cannot be more than ${MAX_CHAT_MESSAGE_LENGTH} characters`
                );
            });

            it('should validate chat request - maintenance mode', async () => {
                await manager.changeMode(ChatMode.Maintenance);
                await expect(manager.chat('Hello')).rejects.toThrow('Chat is in maintenance mode');
            });

            it('should handle chat without existing chat session', async () => {
                // Reset the mock to ensure clean state

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
                expect(mockAnalytics.track).toHaveBeenCalledWith(
                    'agent-message-send',
                    expect.objectContaining({ event: 'error', error: { kind: 'UnknownError', message: 'API Error' } })
                );
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
                    script: { type: 'text', input: 'Hello world', ssml: false },
                    metadata: { chat_id: 'chat-123', agent_id: 'agent-123' },
                });

                expect(result.status).toBe('success');
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-speak', expect.any(Object));
            });

            it('should speak with script object', async () => {
                const script = { type: 'text' as const, input: 'Hello world', ssml: true };

                await manager.speak(script);

                expect(mockStreamingManager.speak).toHaveBeenCalledWith({
                    script: { type: 'text', input: 'Hello world', ssml: true },
                    metadata: { chat_id: 'chat-123', agent_id: 'agent-123' },
                });
            });

            it('should preserve should_queue_speaks in the speak script', async () => {
                const script = {
                    type: 'text' as const,
                    input: 'Hello world',
                    ssml: false,
                    should_queue_speaks: true,
                };

                await manager.speak(script);

                expect(mockStreamingManager.speak).toHaveBeenCalledWith({
                    script: {
                        type: 'text',
                        input: 'Hello world',
                        ssml: false,
                        should_queue_speaks: true,
                    },
                    metadata: { chat_id: 'chat-123', agent_id: 'agent-123' },
                });
            });

            it('should preserve should_queue_speaks when the script has a provider', async () => {
                const script = {
                    type: 'text' as const,
                    provider: { type: Providers.Microsoft, voice_id: 'voice-123' },
                    input: 'Hello world',
                    should_queue_speaks: true,
                };

                await manager.speak(script);

                expect(mockStreamingManager.speak).toHaveBeenCalledWith({
                    script,
                    metadata: { chat_id: 'chat-123', agent_id: 'agent-123' },
                });
            });

            it('should preserve sentiment in the speak script', async () => {
                const script = {
                    type: 'text' as const,
                    input: 'Hello world',
                    ssml: false,
                    sentiment: 'friendly',
                };

                await manager.speak(script);

                expect(mockStreamingManager.speak).toHaveBeenCalledWith({
                    script: {
                        type: 'text',
                        input: 'Hello world',
                        ssml: false,
                        sentiment: 'friendly',
                    },
                    metadata: { chat_id: 'chat-123', agent_id: 'agent-123' },
                });
            });

            it('should preserve sentiment when the script has a provider', async () => {
                const script = {
                    type: 'text' as const,
                    provider: { type: Providers.Microsoft, voice_id: 'voice-123' },
                    input: 'Hello world',
                    sentiment: 'excited',
                };

                await manager.speak(script);

                expect(mockStreamingManager.speak).toHaveBeenCalledWith({
                    script,
                    metadata: { chat_id: 'chat-123', agent_id: 'agent-123' },
                });
            });

            it('should trigger onNewMessage callback when speak is called with text', async () => {
                const textInput = 'Hello from speak method';
                const mockCallback = mockOptions.callbacks.onNewMessage as jest.Mock;

                // Clear previous calls
                mockCallback.mockClear();

                await manager.speak(textInput);

                // Verify onNewMessage was called
                expect(mockCallback).toHaveBeenCalledTimes(1);

                // Verify the message structure
                const [messages, messageType] = mockCallback.mock.calls[0];
                expect(messageType).toBe('answer');
                expect(Array.isArray(messages)).toBe(true);
                expect(messages.length).toBeGreaterThan(0);

                // Check the last message (the one we just added)
                const lastMessage = messages[messages.length - 1];
                expect(lastMessage.role).toBe('assistant');
                expect(lastMessage.content).toBe(textInput);
                expect(lastMessage.id).toBeDefined();
                expect(lastMessage.createdAt).toBeDefined();
            });

            it('should populate parts on speak message', async () => {
                const mockCallback = mockOptions.callbacks.onNewMessage as jest.Mock;
                mockCallback.mockClear();

                await manager.speak('Hello from speak');

                const [messages] = mockCallback.mock.calls[0];
                const lastMessage = messages[messages.length - 1];
                expect(lastMessage.parts).toEqual([{ type: 'text', text: 'Hello from speak' }]);
            });

            it('should trigger onNewMessage with script object', async () => {
                const script = { type: 'text' as const, input: 'Hello from script', ssml: false };
                const mockCallback = mockOptions.callbacks.onNewMessage as jest.Mock;

                // Clear previous calls
                mockCallback.mockClear();

                await manager.speak(script);

                // Verify onNewMessage was called
                expect(mockCallback).toHaveBeenCalledTimes(1);

                // Verify the message content
                const [messages, messageType] = mockCallback.mock.calls[0];
                expect(messageType).toBe('answer');
                const lastMessage = messages[messages.length - 1];
                expect(lastMessage.role).toBe('assistant');
                expect(lastMessage.content).toBe('Hello from script');
            });

            it('should not trigger onNewMessage for non-text script types', async () => {
                const audioScript = { type: 'audio' as const, audio_url: 'http://example.com/audio.mp3' };
                const mockCallback = mockOptions.callbacks.onNewMessage as jest.Mock;

                // Clear previous calls
                mockCallback.mockClear();

                await manager.speak(audioScript);

                // Verify onNewMessage was NOT called for audio script
                expect(mockCallback).not.toHaveBeenCalled();
            });

            it('should handle textual chat mode', async () => {
                const { isTextualChat } = require('../../utils/chat');
                (isTextualChat as jest.Mock).mockReturnValueOnce(true);

                await manager.changeMode(ChatMode.TextOnly);

                const result = await manager.speak('Hello world');

                expect(result).toEqual({ duration: 0, videoId: '', status: 'success' });
                expect(mockStreamingManager.speak).not.toHaveBeenCalled();
            });

            it('Should resolve the default response when the streaming manager resolves nothing', async () => {
                mockStreamingManager.speak.mockResolvedValueOnce(undefined);

                const result = await manager.speak('Hello world');

                expect(result).toEqual({ duration: 0, videoId: '', status: 'success' });
            });

            it('should throw error if not connected', async () => {
                await manager.disconnect();

                await expect(manager.speak('Hello')).rejects.toThrow('Please connect to the agent first');
            });
        });

        describe('interrupt', () => {
            const getLastMessage = (onNewMessage: jest.Mock) => {
                const messages = onNewMessage.mock.calls[onNewMessage.mock.calls.length - 1][0];
                return messages[messages.length - 1];
            };

            beforeEach(async () => {
                mockStreamingManager.interruptAvailable = true;
                await manager.connect();
            });

            it('should interrupt successfully', async () => {
                // Add a message to interrupt
                await manager.chat('Hello');

                manager.interrupt({ type: 'click' });

                expect(mockStreamingManager.interrupt).toHaveBeenCalledWith('click');
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-video-interrupt', {
                    type: 'click',
                    video_duration_to_interrupt: expect.any(Number),
                    message_duration_to_interrupt: expect.any(Number),
                });
            });

            it('should default to a click interrupt when called with no options', async () => {
                await manager.chat('Hello');

                manager.interrupt();

                expect(mockStreamingManager.interrupt).toHaveBeenCalledWith('click');
                expect(mockAnalytics.track).toHaveBeenCalledWith(
                    'agent-video-interrupt',
                    expect.objectContaining({ type: 'click' })
                );
            });

            it('should still take an explicit cause', async () => {
                await manager.chat('Hello');

                manager.interrupt({ type: 'audio' });

                expect(mockStreamingManager.interrupt).toHaveBeenCalledWith('audio');
                expect(mockAnalytics.track).toHaveBeenCalledWith(
                    'agent-video-interrupt',
                    expect.objectContaining({ type: 'audio' })
                );
            });

            // Guards propagation from a misbehaving streaming manager: the real ones never throw.
            it('should handle validateInterrupt rejection', async () => {
                // Add a message to interrupt
                await manager.chat('Hello');

                // Mock streamingManager.interrupt to throw a validation error
                (mockStreamingManager.interrupt as jest.Mock).mockImplementationOnce(() => {
                    throw new Error('Interrupt validation failed');
                });

                expect(() => manager.interrupt({ type: 'click' })).toThrow('Interrupt validation failed');

                // Verify streamingManager.interrupt was called
                expect(mockStreamingManager.interrupt).toHaveBeenCalledWith('click');
            });

            it('should not mark the last message interrupted when the stream is not interruptible', async () => {
                mockStreamingManager.isInterruptible = false;
                await manager.chat('Hello');

                const onNewMessage = mockOptions.callbacks.onNewMessage as jest.Mock;
                const lastMessage = getLastMessage(onNewMessage);
                onNewMessage.mockClear();

                manager.interrupt({ type: 'click' });

                expect(mockStreamingManager.interrupt).not.toHaveBeenCalled();
                expect(onNewMessage).not.toHaveBeenCalled();
                expect(lastMessage.interrupted).toBeUndefined();
            });

            it('should not mark the last message interrupted when the stream manager rejects the interrupt', async () => {
                await manager.chat('Hello');

                const onNewMessage = mockOptions.callbacks.onNewMessage as jest.Mock;
                const lastMessage = getLastMessage(onNewMessage);
                onNewMessage.mockClear();
                (mockStreamingManager.interrupt as jest.Mock).mockImplementationOnce(() => {
                    throw new Error('Interrupt validation failed');
                });

                expect(() => manager.interrupt({ type: 'click' })).toThrow('Interrupt validation failed');

                expect(onNewMessage).not.toHaveBeenCalled();
                expect(lastMessage.interrupted).toBeUndefined();
            });

            it('should not mark the last message interrupted when the stream sent no interrupt', async () => {
                await manager.chat('Hello');

                const onNewMessage = mockOptions.callbacks.onNewMessage as jest.Mock;
                const lastMessage = getLastMessage(onNewMessage);
                onNewMessage.mockClear();
                (mockStreamingManager.interrupt as jest.Mock).mockReturnValueOnce(false);

                manager.interrupt({ type: 'click' });

                expect(mockStreamingManager.interrupt).toHaveBeenCalledWith('click');
                expect(onNewMessage).not.toHaveBeenCalled();
                expect(lastMessage.interrupted).toBeUndefined();
            });

            it('should mark the last message interrupted once the interrupt was sent', async () => {
                await manager.chat('Hello');

                const onNewMessage = mockOptions.callbacks.onNewMessage as jest.Mock;
                const lastMessage = getLastMessage(onNewMessage);
                onNewMessage.mockClear();

                manager.interrupt({ type: 'click' });

                expect(lastMessage.interrupted).toBe(true);
                expect(onNewMessage).toHaveBeenCalledWith(expect.any(Array), 'answer');
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

            it('should throw error if chat not initialized when rating', async () => {
                // Reset mocks to ensure clean state

                // Mock initializeStreamAndChat to return no chat
                (initializeStreamAndChat as jest.Mock).mockResolvedValue({
                    streamingManager: mockStreamingManager,
                    chat: undefined,
                });

                // Create a manager and connect, but ensure no chat is set
                const newManager = await createAgentManager('agent-123', mockOptions);
                await newManager.connect();

                await expect(newManager.rate('message-id', 1)).rejects.toMatchObject({
                    kind: 'ValidationError',
                    message: 'Chat is not initialized',
                });
            });

            it('should throw error if message not found', async () => {
                await expect(manager.rate('non-existent-id', 1)).rejects.toMatchObject({
                    kind: 'ValidationError',
                    message: 'Message not found',
                });
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

            it('should throw error if chat not initialized when deleting rating', async () => {
                // Reset mocks to ensure clean state

                // Mock initializeStreamAndChat to return no chat
                (initializeStreamAndChat as jest.Mock).mockResolvedValue({
                    streamingManager: mockStreamingManager,
                    chat: undefined,
                });

                // Create a manager and connect, but ensure no chat is set
                const newManager = await createAgentManager('agent-123', mockOptions);
                await newManager.connect();

                await expect(newManager.deleteRate('rating-123')).rejects.toMatchObject({
                    kind: 'ValidationError',
                    message: 'Chat is not initialized',
                });
            });
        });

        describe('submitFeedback', () => {
            beforeEach(async () => {
                await manager.connect();
            });

            it('should submit feedback successfully', async () => {
                await manager.submitFeedback(4, 'nice');

                expect(mockAgentsApi.submitFeedback).toHaveBeenCalledWith('agent-123', 'chat-123', {
                    rating: 4,
                    answer: 'nice',
                });
                expect(mockAnalytics.track).toHaveBeenCalledWith('agent-feedback', {
                    rating: 4,
                    hasAnswer: true,
                });
            });

            it('should accept every score on the scale and reject anything else', async () => {
                // The Agents API rejects a rating that is not an integer from 1 to 5
                // (`feedback.ts`, "rating must be an integer between 1 and 5"), so the type does too.
                await Promise.all(([1, 2, 3, 4, 5] as const).map(rating => manager.submitFeedback(rating)));

                expect(mockAgentsApi.submitFeedback).toHaveBeenCalledTimes(5);

                // @ts-expect-error 0 is below the scale.
                await manager.submitFeedback(0);
                // @ts-expect-error 4.5 is not a whole star.
                await manager.submitFeedback(4.5);
            });

            it('should throw error if chat not initialized when submitting feedback', async () => {
                (initializeStreamAndChat as jest.Mock).mockResolvedValue({
                    streamingManager: mockStreamingManager,
                    chat: undefined,
                });

                const newManager = await createAgentManager('agent-123', mockOptions);
                await newManager.connect();

                await expect(newManager.submitFeedback(4)).rejects.toMatchObject({
                    kind: 'ValidationError',
                    message: 'Chat is not initialized',
                });
            });
        });

        describe('rating guards without a chat', () => {
            it('should reject rather than throw synchronously, so .catch() sees the ValidationError', async () => {
                (initializeStreamAndChat as jest.Mock).mockResolvedValue({
                    streamingManager: mockStreamingManager,
                    chat: undefined,
                });

                const newManager = await createAgentManager('agent-123', mockOptions);
                await newManager.connect();

                // calling must not throw: the guard has to come back as a rejected promise
                const pending = [
                    newManager.rate('message-id', 1),
                    newManager.deleteRate('rating-123'),
                    newManager.submitFeedback(4),
                ];

                const reasons = await Promise.all(pending.map(promise => promise.catch(error => error)));

                expect(reasons).toHaveLength(3);
                for (const reason of reasons) {
                    expect(reason).toBeInstanceOf(ValidationError);
                    expect(reason.message).toBe('Chat is not initialized');
                }
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

            it('should resolve only once the disconnect it triggers has finished', async () => {
                await manager.connect();
                let settleDisconnect = () => {};
                mockStreamingManager.disconnect = jest.fn(
                    () => new Promise<void>(resolve => (settleDisconnect = resolve))
                );

                const onSettled = jest.fn();
                const pending = Promise.resolve(manager.changeMode(ChatMode.TextOnly)).then(onSettled);
                await Promise.resolve();

                expect(onSettled).not.toHaveBeenCalled();

                settleDisconnect();
                await pending;

                expect(onSettled).toHaveBeenCalled();
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
                expect(manager.isInterruptAvailable()).toBe(false);
            });

            it('should get STT token', async () => {
                const token = await manager.getSttToken();
                expect(token).toEqual({ token: 'stt-token' });
                expect(mockAgentsApi.getSttToken).toHaveBeenCalledWith('agent-123');
            });
        });
    });

    describe('publishMicrophoneStream', () => {
        let manager: AgentManager;

        beforeEach(async () => {
            manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();
        });

        it('should publish microphone stream when available', async () => {
            const mockStream = new MediaStream();
            const mockPublish = jest.fn().mockResolvedValue(undefined);
            mockStreamingManager.publishMicrophoneStream = mockPublish;

            await manager.publishMicrophoneStream?.(mockStream);

            expect(mockPublish).toHaveBeenCalledWith(mockStream);
        });

        it('should throw error when publishMicrophoneStream is not available', async () => {
            mockStreamingManager.publishMicrophoneStream = undefined;

            await expect(manager.publishMicrophoneStream?.(new MediaStream())).rejects.toMatchObject({
                kind: 'ValidationError',
                message: 'publishMicrophoneStream is only available on Expressive (V4) agents, after connect()',
            });
        });
    });

    describe('setSttLanguage', () => {
        it('should send the language on the stt-language topic for v2 agents', async () => {
            mockAgent.avatar = { type: AvatarType.Expressive, voice: { language: 'en-US' } };

            const manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();

            await manager.setSttLanguage('French');

            expect(mockStreamingManager.sendDataChannelMessage).toHaveBeenCalledWith(
                InternalDataChannelTopic.SttLanguage,
                JSON.stringify({ language: 'French' })
            );
            expect(mockAnalytics.track).toHaveBeenCalledWith('agent-stt-language-change', { language: 'French' });
        });

        it('should throw error when the agent is not a v2 agent', async () => {
            const manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();

            await expect(manager.setSttLanguage('French')).rejects.toMatchObject({
                kind: 'ValidationError',
                message: 'setSttLanguage is only available on Expressive (V4) agents, after connect()',
            });
            expect(mockStreamingManager.sendDataChannelMessage).not.toHaveBeenCalled();
        });

        it('resolves only once the send settles', async () => {
            mockAgent.avatar = { type: AvatarType.Expressive, voice: { language: 'en-US' } };
            let settleSend = () => {};
            mockStreamingManager.sendDataChannelMessage = jest.fn(
                () => new Promise<void>(resolve => (settleSend = resolve))
            );

            const manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();

            const onSettled = jest.fn();
            const pending = manager.setSttLanguage('French').then(onSettled);
            await Promise.resolve();

            expect(onSettled).not.toHaveBeenCalled();

            settleSend();
            await pending;

            expect(onSettled).toHaveBeenCalled();
        });
    });

    describe('sendDataChannelMessage', () => {
        it('should delegate to the streaming manager for v2 agents', async () => {
            mockAgent.avatar = { type: AvatarType.Expressive, voice: { language: 'en-US' } };

            const manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();

            await manager.sendDataChannelMessage(DataChannelTopic.Presentation, { type: 'navigate', slide: 3 });

            expect(mockStreamingManager.sendDataChannelMessage).toHaveBeenCalledWith(
                DataChannelTopic.Presentation,
                JSON.stringify({ type: 'navigate', slide: 3 })
            );
            expect(mockAnalytics.track).toHaveBeenCalledWith('agent-data-message', {
                topic: DataChannelTopic.Presentation,
            });
        });

        it('should throw error when the agent is not a v2 agent', async () => {
            const manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();

            await expect(
                manager.sendDataChannelMessage(DataChannelTopic.Presentation, { slide: 1 })
            ).rejects.toMatchObject({
                kind: 'ValidationError',
                message: 'sendDataChannelMessage is only available on Expressive (V4) agents, after connect()',
            });
            expect(mockStreamingManager.sendDataChannelMessage).not.toHaveBeenCalled();
        });

        it('resolves only once the send settles', async () => {
            mockAgent.avatar = { type: AvatarType.Expressive, voice: { language: 'en-US' } };
            let settleSend = () => {};
            mockStreamingManager.sendDataChannelMessage = jest.fn(
                () => new Promise<void>(resolve => (settleSend = resolve))
            );

            const manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();

            const onSettled = jest.fn();
            const pending = manager.sendDataChannelMessage(DataChannelTopic.Presentation, { slide: 3 }).then(onSettled);
            await Promise.resolve();

            expect(onSettled).not.toHaveBeenCalled();

            settleSend();
            await pending;

            expect(onSettled).toHaveBeenCalled();
        });
    });

    describe('unpublishMicrophoneStream', () => {
        let manager: AgentManager;

        beforeEach(async () => {
            manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();
        });

        it('should unpublish microphone stream when available', async () => {
            const mockUnpublish = jest.fn().mockResolvedValue(undefined);
            mockStreamingManager.unpublishMicrophoneStream = mockUnpublish;

            await manager.unpublishMicrophoneStream?.();

            expect(mockUnpublish).toHaveBeenCalled();
        });

        it('should no-op when unpublishMicrophoneStream is not available', async () => {
            mockStreamingManager.unpublishMicrophoneStream = undefined;

            await expect(manager.unpublishMicrophoneStream?.()).resolves.toBeUndefined();
        });
    });

    describe('replaceMicrophoneTrack', () => {
        let manager: AgentManager;

        beforeEach(async () => {
            manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();
        });

        it('should replace microphone track when available', async () => {
            const mockTrack = { kind: 'audio', id: 'audio-track-1' } as unknown as MediaStreamTrack;
            const mockReplace = jest.fn().mockResolvedValue(undefined);
            mockStreamingManager.replaceMicrophoneTrack = mockReplace;

            await manager.replaceMicrophoneTrack?.(mockTrack);

            expect(mockReplace).toHaveBeenCalledWith(mockTrack);
        });

        it('should throw error when replaceMicrophoneTrack is not available', async () => {
            mockStreamingManager.replaceMicrophoneTrack = undefined;
            const mockTrack = { kind: 'audio', id: 'audio-track-1' } as unknown as MediaStreamTrack;

            await expect(manager.replaceMicrophoneTrack?.(mockTrack)).rejects.toMatchObject({
                kind: 'ValidationError',
                message: 'replaceMicrophoneTrack is only available on Expressive (V4) agents, after connect()',
            });
        });
    });

    describe('publishCameraStream', () => {
        let manager: AgentManager;

        beforeEach(async () => {
            manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();
        });

        it('should publish camera stream when available', async () => {
            const mockStream = new MediaStream();
            const mockPublish = jest.fn().mockResolvedValue(undefined);
            mockStreamingManager.publishCameraStream = mockPublish;

            await manager.publishCameraStream?.(mockStream);

            expect(mockPublish).toHaveBeenCalledWith(mockStream);
        });

        it('should throw error when publishCameraStream is not available', async () => {
            mockStreamingManager.publishCameraStream = undefined;

            await expect(manager.publishCameraStream?.(new MediaStream())).rejects.toMatchObject({
                kind: 'ValidationError',
                message: 'publishCameraStream is only available on Expressive (V4) agents, after connect()',
            });
        });
    });

    describe('unpublishCameraStream', () => {
        let manager: AgentManager;

        beforeEach(async () => {
            manager = await createAgentManager('agent-123', mockOptions);
            await manager.connect();
        });

        it('should unpublish camera stream when available', async () => {
            const mockUnpublish = jest.fn().mockResolvedValue(undefined);
            mockStreamingManager.unpublishCameraStream = mockUnpublish;

            await manager.unpublishCameraStream?.();

            expect(mockUnpublish).toHaveBeenCalled();
        });

        it('should no-op when unpublishCameraStream is not available', async () => {
            mockStreamingManager.unpublishCameraStream = undefined;

            await expect(manager.unpublishCameraStream?.()).resolves.toBeUndefined();
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
            mockAgentsApi.getRuntimeById.mockRejectedValueOnce(error);

            await expect(createAgentManager('invalid-agent', mockOptions)).rejects.toThrow('Agent not found');
        });

        it('should handle analytics initialization with disabled analytics', async () => {
            const optionsWithoutAnalytics = { ...mockOptions, analytics: { enabled: false } };

            await createAgentManager('agent-123', optionsWithoutAnalytics);

            expect(initializeAnalytics).toHaveBeenCalledWith({
                token: 'test-mixpanel-key',
                agentId: 'agent-123',
                isEnabled: false,
                externalId: undefined,
                mixpanelAdditionalProperties: undefined,
            });
        });
    });

    describe('registerClientTool', () => {
        let manager: AgentManager;

        beforeEach(async () => {
            mockStreamingManager.registerRpcMethod = jest.fn();
            mockStreamingManager.unregisterRpcMethod = jest.fn();
            // Client tools are an Expressive (V4) feature: the RPC channel they travel on exists
            // only there.
            mockAgent.avatar = { type: AvatarType.Expressive, voice: { language: 'en-US' } };
            manager = await createAgentManager('agent-123', mockOptions);
        });

        it('should reject on a Talks (V2) or Clips (V3) agent instead of doing nothing', async () => {
            mockAgent.avatar = { type: AvatarType.Talk, voice: { language: 'en-US' } };
            const talksManager = await createAgentManager('agent-123', mockOptions);

            expect(() => talksManager.registerClientTool('testTool', async () => 'result')).toThrow(ValidationError);
            expect(() => talksManager.registerClientTool('testTool', async () => 'result')).toThrow(
                'registerClientTool is only available on Expressive (V4) agents'
            );
        });

        it('should let unregisterClientTool run on any agent type', async () => {
            mockAgent.avatar = { type: AvatarType.Talk, voice: { language: 'en-US' } };
            const talksManager = await createAgentManager('agent-123', mockOptions);

            expect(() => talksManager.unregisterClientTool('testTool')).not.toThrow();
        });

        it('should register tool and call registerRpcMethod after connect', async () => {
            const handler = jest.fn().mockResolvedValue('result');

            await manager.connect();
            manager.registerClientTool('testTool', handler);

            expect(mockStreamingManager.registerRpcMethod).toHaveBeenCalledWith('testTool', expect.any(Function));
        });

        it('should buffer tool registration before connect and flush on connect', async () => {
            const handler = jest.fn().mockResolvedValue('result');

            manager.registerClientTool('testTool', handler);
            expect(mockStreamingManager.registerRpcMethod).not.toHaveBeenCalled();

            await manager.connect();
            expect(mockStreamingManager.registerRpcMethod).toHaveBeenCalledWith('testTool', expect.any(Function));
        });

        it('should not call registerRpcMethod twice for same tool name', async () => {
            const handler1 = jest.fn().mockResolvedValue('result1');
            const handler2 = jest.fn().mockResolvedValue('result2');

            await manager.connect();
            manager.registerClientTool('testTool', handler1);
            manager.registerClientTool('testTool', handler2);

            expect(mockStreamingManager.registerRpcMethod).toHaveBeenCalledTimes(1);
        });

        it('should unregister tool from map and room', async () => {
            const handler = jest.fn().mockResolvedValue('result');

            await manager.connect();
            manager.registerClientTool('testTool', handler);
            manager.unregisterClientTool('testTool');

            expect(mockStreamingManager.unregisterRpcMethod).toHaveBeenCalledWith('testTool');
        });

        it('should invoke latest handler when RPC is called after re-registration', async () => {
            const handler1 = jest.fn().mockResolvedValue('result1');
            const handler2 = jest.fn().mockResolvedValue('result2');

            await manager.connect();
            manager.registerClientTool('testTool', handler1);

            // Get the RPC handler that was registered
            const rpcHandler = mockStreamingManager.registerRpcMethod.mock.calls[0][1];

            // Re-register with new handler (same name — only updates Map)
            manager.registerClientTool('testTool', handler2);

            // Invoke the RPC handler — should use handler2 from Map
            const result = await rpcHandler({ payload: '{"key": "val"}' });

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).toHaveBeenCalledWith({ key: 'val' });
            expect(result).toBe('result2');
        });

        it('should accept a synchronous handler and await its result all the same', async () => {
            await manager.connect();
            manager.registerClientTool('locale', args => JSON.stringify({ got: args.key }));

            const rpcHandler = mockStreamingManager.registerRpcMethod.mock.calls[0][1];

            await expect(rpcHandler({ payload: '{"key": "val"}' })).resolves.toBe('{"got":"val"}');
        });

        it('should reject with the handler reason verbatim', async () => {
            const handler = jest.fn().mockRejectedValue(new Error('No form fields configured.'));

            await manager.connect();
            manager.registerClientTool('testTool', handler);
            const rpcHandler = mockStreamingManager.registerRpcMethod.mock.calls[0][1];

            await expect(rpcHandler({ payload: '{}' })).rejects.toThrow('No form fields configured.');
        });

        it('should pass a non-Error rejection through untouched', async () => {
            const handler = jest.fn().mockRejectedValue('boom');

            await manager.connect();
            manager.registerClientTool('testTool', handler);
            const rpcHandler = mockStreamingManager.registerRpcMethod.mock.calls[0][1];

            await expect(rpcHandler({ payload: '{}' })).rejects.toBe('boom');
        });

        it('should reject when no handler is registered for the method', async () => {
            await manager.connect();
            manager.registerClientTool('testTool', jest.fn());
            const rpcHandler = mockStreamingManager.registerRpcMethod.mock.calls[0][1];
            manager.unregisterClientTool('testTool');

            await expect(rpcHandler({ payload: '{}' })).rejects.toThrow(
                'No handler registered for client tool: testTool'
            );
        });

        function rpcMethodsFromStream() {
            return (initializeStreamAndChat as jest.Mock).mock.calls[0][1].rpcMethods;
        }

        it('should hand tools registered before connect to the stream so they are live on join', async () => {
            manager.registerClientTool('did.presentation', jest.fn().mockResolvedValue('{}'));

            await manager.connect();

            expect([...rpcMethodsFromStream().keys()]).toEqual(['did.presentation']);
        });

        it('should dispatch a method handed to the stream to the registered tool handler', async () => {
            const handler = jest.fn().mockResolvedValue('{"ok":true}');
            manager.registerClientTool('did.presentation', handler);

            await manager.connect();

            const rpcHandler = rpcMethodsFromStream().get('did.presentation');
            await expect(rpcHandler({ payload: '{"type":"show_slide"}' })).resolves.toBe('{"ok":true}');
            expect(handler).toHaveBeenCalledWith({ type: 'show_slide' });
        });

        it('should hand an empty map when no tools were registered before connect', async () => {
            await manager.connect();

            expect(rpcMethodsFromStream().size).toBe(0);
        });

        it('should unregister before re-registering a tool that was already registered pre-connect', async () => {
            // Room.registerRpcMethod throws on a duplicate method, and the pre-connect hook has
            // already registered this name by the time the post-connect flush runs.
            manager.registerClientTool('did.presentation', jest.fn());

            await manager.connect();

            expect(mockStreamingManager.unregisterRpcMethod).toHaveBeenCalledWith('did.presentation');
            expect(mockStreamingManager.unregisterRpcMethod.mock.invocationCallOrder[0]).toBeLessThan(
                mockStreamingManager.registerRpcMethod.mock.invocationCallOrder[0]
            );
        });
    });
});
