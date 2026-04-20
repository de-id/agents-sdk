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

    describe('multi-message assistant turns', () => {
        beforeEach(() => {
            mockItems.messages.push({
                id: 'user-1',
                role: 'user',
                content: 'please book a meeting',
                created_at: new Date().toISOString(),
                transcribed: true,
            });
        });

        it('should append a new assistant message when answer arrives with a different id', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            onMessage(ChatProgress.Answer, { id: 'assistant-1', content: "ok, i'll book a meeting" });
            onMessage(ChatProgress.Answer, { id: 'assistant-2', content: 'i booked a meeting for you' });

            const assistantMessages = mockItems.messages.filter(m => m.role === 'assistant');
            expect(assistantMessages).toHaveLength(2);
            expect(assistantMessages[0].id).toBe('assistant-1');
            expect(assistantMessages[0].content).toBe("ok, i'll book a meeting");
            expect(assistantMessages[1].id).toBe('assistant-2');
            expect(assistantMessages[1].content).toBe('i booked a meeting for you');
        });

        it('should preserve the first assistant message when a second arrives after a tool call', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            onMessage(ChatProgress.Answer, { id: 'assistant-1', content: "ok, i'll book a meeting" });
            // ToolCalling / ToolResult events are dispatched via a separate callback and do not
            // touch messages; simulating that gap here means the next answer event arrives with
            // a fresh id.
            onMessage(ChatProgress.Answer, { id: 'assistant-2', content: 'i booked a meeting for you' });

            expect(mockItems.messages.map(m => m.content)).toEqual([
                'please book a meeting',
                "ok, i'll book a meeting",
                'i booked a meeting for you',
            ]);
        });

        it('should overwrite the last assistant message when answer has the same id', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            onMessage(ChatProgress.Answer, { id: 'assistant-1', content: 'first draft' });
            onMessage(ChatProgress.Answer, { id: 'assistant-1', content: 'final answer' });

            const assistantMessages = mockItems.messages.filter(m => m.role === 'assistant');
            expect(assistantMessages).toHaveLength(1);
            expect(assistantMessages[0].content).toBe('final answer');
        });

        it('should overwrite the last assistant message when answer has no id (legacy backends)', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            onMessage(ChatProgress.Answer, { content: 'first' });
            onMessage(ChatProgress.Answer, { content: 'second' });

            const assistantMessages = mockItems.messages.filter(m => m.role === 'assistant');
            expect(assistantMessages).toHaveLength(1);
            expect(assistantMessages[0].content).toBe('second');
        });

        it('should not leak content from the previous assistant message into the new one', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            onMessage(ChatProgress.Answer, { id: 'assistant-1', content: "ok, i'll book a meeting" });
            onMessage(ChatProgress.Answer, { id: 'assistant-2', content: 'done' });

            const assistantMessages = mockItems.messages.filter(m => m.role === 'assistant');
            expect(assistantMessages).toHaveLength(2);
            expect(assistantMessages[1].content).toBe('done');
            expect(assistantMessages[1].content).not.toContain("ok, i'll book");
        });

        it('should keep streaming partials into the same assistant message', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            onMessage(ChatProgress.Partial, { content: 'Hello', sequence: 0 });
            onMessage(ChatProgress.Partial, { content: ' World', sequence: 1 });

            const assistantMessages = mockItems.messages.filter(m => m.role === 'assistant');
            expect(assistantMessages).toHaveLength(1);
            expect(assistantMessages[0].content).toBe('Hello World');
        });

        it('should append a new assistant message when partials arrive with a different id', () => {
            const { onMessage } = createMessageEventQueue(
                mockAnalytics,
                mockItems,
                mockOptions,
                mockAgent,
                mockOnStreamDone
            );

            onMessage(ChatProgress.Partial, { id: 'assistant-1', content: 'first ', sequence: 0 });
            onMessage(ChatProgress.Partial, { id: 'assistant-1', content: 'message', sequence: 1 });
            onMessage(ChatProgress.Answer, { id: 'assistant-1', content: 'first message' });

            onMessage(ChatProgress.Partial, { id: 'assistant-2', content: 'second ', sequence: 0 });
            onMessage(ChatProgress.Partial, { id: 'assistant-2', content: 'message', sequence: 1 });
            onMessage(ChatProgress.Answer, { id: 'assistant-2', content: 'second message' });

            const assistantMessages = mockItems.messages.filter(m => m.role === 'assistant');
            expect(assistantMessages).toHaveLength(2);
            expect(assistantMessages[0].content).toBe('first message');
            expect(assistantMessages[1].content).toBe('second message');
            expect(assistantMessages[1].content).not.toContain('first');
        });
    });
});
