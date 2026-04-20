import { ChatMode, ChatProgress } from '@sdk/types';
import { AgentManagerItems } from '../agent-manager';
import { createMessageEventQueue } from './message-queue';

jest.mock('@sdk/utils/analytics', () => ({
    getStreamAnalyticsProps: jest.fn(() => ({})),
}));

describe('createMessageEventQueue', () => {
    let mockAnalytics: any;
    let mockItems: AgentManagerItems;
    let mockOptions: any;
    let mockAgent: any;
    let mockOnStreamDone: jest.Mock;
    let mockOnNewMessage: jest.Mock;

    beforeEach(() => {
        mockAnalytics = {
            track: jest.fn(),
            linkTrack: jest.fn(),
        };

        mockItems = {
            messages: [],
            chatMode: ChatMode.Functional,
        } as AgentManagerItems;

        mockOnNewMessage = jest.fn();
        mockOptions = {
            callbacks: {
                onNewMessage: mockOnNewMessage,
                onError: jest.fn(),
            },
        };

        mockAgent = { id: 'agent-1' };
        mockOnStreamDone = jest.fn();
    });

    describe('queue clearing behavior', () => {
        it('should clear queue when user event is received', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            mockItems.messages.push({
                id: 'user-1',
                role: 'user',
                content: 'first question',
                created_at: new Date().toISOString(),
                transcribed: true,
            });

            onMessage(ChatProgress.Partial, { content: 'Old', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: ' response', sequence: 1 });

            onMessage(ChatProgress.Transcribe, {
                content: 'new user message',
                role: 'user',
                id: 'user-2',
            });

            onMessage(ChatProgress.Partial, { content: 'New', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: ' response', sequence: 1 });

            const lastCall = mockOnNewMessage.mock.calls[mockOnNewMessage.mock.calls.length - 1];
            const lastMessage = lastCall[0][lastCall[0].length - 1];
            expect(lastMessage.content).toBe('New response');
            expect(lastMessage.content).not.toContain('Old');
        });

        it('should NOT clear queue when partial event is received', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            mockItems.messages.push({
                id: 'user-1',
                role: 'user',
                content: 'test',
                created_at: new Date().toISOString(),
                transcribed: true,
            });

            onMessage(ChatProgress.Partial, { content: 'Hello', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: ' World', sequence: 1 });

            const lastCall = mockOnNewMessage.mock.calls[mockOnNewMessage.mock.calls.length - 1];
            const lastMessage = lastCall[0][lastCall[0].length - 1];
            expect(lastMessage.content).toBe('Hello World');
        });

        it('should NOT clear queue when answer event is received', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            mockItems.messages.push({
                id: 'user-1',
                role: 'user',
                content: 'test',
                created_at: new Date().toISOString(),
                transcribed: true,
            });

            onMessage(ChatProgress.Partial, { content: 'Hello', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: ' World', sequence: 1 });
            onMessage(ChatProgress.Answer, { content: 'Hello World!' });

            const lastCall = mockOnNewMessage.mock.calls[mockOnNewMessage.mock.calls.length - 1];
            const lastMessage = lastCall[0][lastCall[0].length - 1];
            expect(lastMessage.content).toBe('Hello World!');
        });

        it('should accumulate partials correctly without clearing', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            mockItems.messages.push({
                id: 'user-1',
                role: 'user',
                content: 'test',
                created_at: new Date().toISOString(),
                transcribed: true,
            });

            onMessage(ChatProgress.Partial, { content: 'A', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: 'B', sequence: 1 });
            onMessage(ChatProgress.Partial, { content: 'C', sequence: 2 });
            onMessage(ChatProgress.Partial, { content: 'D', sequence: 3 });

            const lastCall = mockOnNewMessage.mock.calls[mockOnNewMessage.mock.calls.length - 1];
            const lastMessage = lastCall[0][lastCall[0].length - 1];
            expect(lastMessage.content).toBe('ABCD');
        });

        it('should clear stale partials when new transcription arrives', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            mockItems.messages.push({
                id: 'user-1',
                role: 'user',
                content: 'first message',
                created_at: new Date().toISOString(),
                transcribed: true,
            });

            onMessage(ChatProgress.Partial, { content: 'Old', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: ' response', sequence: 1 });

            const assistantMessageBeforeInterrupt = mockItems.messages.find(m => m.role === 'assistant');
            expect(assistantMessageBeforeInterrupt?.content).toBe('Old response');

            onMessage(ChatProgress.Transcribe, {
                content: 'interrupt message',
                role: 'user',
                id: 'user-2',
            });

            onMessage(ChatProgress.Partial, { content: 'Fresh', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: ' start', sequence: 1 });

            const newAssistantMessage = mockItems.messages[mockItems.messages.length - 1];
            expect(newAssistantMessage.role).toBe('assistant');
            expect(newAssistantMessage.content).toBe('Fresh start');
            expect(newAssistantMessage.content).not.toContain('Old');
        });
    });

    describe('first assistant turn (greeting)', () => {
        it('creates an assistant message when partials arrive with no prior messages', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            onMessage(ChatProgress.Partial, { content: 'Hello', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: ' there', sequence: 1 });
            onMessage(ChatProgress.Answer, { content: 'Hello there!' });

            expect(mockItems.messages).toHaveLength(1);
            expect(mockItems.messages[0]).toMatchObject({
                role: 'assistant',
                content: 'Hello there!',
            });
            expect(mockOnNewMessage).toHaveBeenCalled();
        });

        it('streams partials live for a greeting before the final answer', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            onMessage(ChatProgress.Partial, { content: 'Hel', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: 'lo', sequence: 1 });

            expect(mockItems.messages).toHaveLength(1);
            expect(mockItems.messages[0]).toMatchObject({ role: 'assistant', content: 'Hello' });
            expect(mockOnNewMessage).toHaveBeenCalled();
            const lastCall = mockOnNewMessage.mock.calls[mockOnNewMessage.mock.calls.length - 1];
            expect(lastCall[1]).toBe(ChatProgress.Partial);
        });
    });

    describe('clearQueue function', () => {
        it('should expose clearQueue for external use', () => {
            const { clearQueue } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            expect(typeof clearQueue).toBe('function');
        });

        it('should clear queue when called directly', () => {
            const { onMessage, clearQueue } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            mockItems.messages.push({
                id: 'user-1',
                role: 'user',
                content: 'test',
                created_at: new Date().toISOString(),
                transcribed: true,
            });

            onMessage(ChatProgress.Partial, { content: 'Old', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: ' data', sequence: 1 });

            clearQueue();

            onMessage(ChatProgress.Partial, { content: 'Fresh', sequence: 0 });

            const lastCall = mockOnNewMessage.mock.calls[mockOnNewMessage.mock.calls.length - 1];
            const lastMessage = lastCall[0][lastCall[0].length - 1];
            expect(lastMessage.content).toBe('Fresh');
        });
    });

    describe('message parts population', () => {
        it('should populate parts on partial messages', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            // Start with an existing assistant message so partials update it
            mockItems.messages.push({
                id: 'assistant-1',
                role: 'assistant',
                content: '',
                created_at: new Date().toISOString(),
            });

            onMessage(ChatProgress.Partial, { content: 'Hello ![img](https://example.com/pic.png)', sequence: 0 });

            const lastCall = mockOnNewMessage.mock.calls[mockOnNewMessage.mock.calls.length - 1];
            const lastMessage = lastCall[0][lastCall[0].length - 1];
            expect(lastMessage.parts).toEqual([
                { type: 'text', text: 'Hello ' },
                { type: 'image', src: 'https://example.com/pic.png', alt: 'img' },
            ]);
        });

        it('should populate parts on answer messages', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            mockItems.messages.push({
                id: 'user-1',
                role: 'user',
                content: 'test',
                created_at: new Date().toISOString(),
                transcribed: true,
            });

            onMessage(ChatProgress.Answer, { content: 'Check [this](https://example.com)' });

            const lastCall = mockOnNewMessage.mock.calls[mockOnNewMessage.mock.calls.length - 1];
            const lastMessage = lastCall[0][lastCall[0].length - 1];
            expect(lastMessage.parts).toEqual([
                { type: 'text', text: 'Check ' },
                { type: 'link', href: 'https://example.com', label: 'this' },
            ]);
        });

        it('should populate parts for plain text content', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            mockItems.messages.push({
                id: 'user-1',
                role: 'user',
                content: 'test',
                created_at: new Date().toISOString(),
                transcribed: true,
            });

            onMessage(ChatProgress.Answer, { content: 'Just plain text' });

            const lastCall = mockOnNewMessage.mock.calls[mockOnNewMessage.mock.calls.length - 1];
            const lastMessage = lastCall[0][lastCall[0].length - 1];
            expect(lastMessage.parts).toEqual([{ type: 'text', text: 'Just plain text' }]);
        });

        it('should populate parts on transcribed user messages', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            onMessage(ChatProgress.Transcribe, {
                content: 'Hello there',
                role: 'user',
                id: 'user-transcribed-1',
            });

            const lastCall = mockOnNewMessage.mock.calls[mockOnNewMessage.mock.calls.length - 1];
            const lastMessage = lastCall[0][lastCall[0].length - 1];
            expect(lastMessage.role).toBe('user');
            expect(lastMessage.transcribed).toBe(true);
            expect(lastMessage.parts).toEqual([{ type: 'text', text: 'Hello there' }]);
        });
    });
});
