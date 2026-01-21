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
});
