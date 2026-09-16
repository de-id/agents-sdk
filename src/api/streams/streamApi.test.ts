import { Auth } from '@sdk/types/auth';

const mockPost = jest.fn();

jest.mock('../apiClient', () => ({
    createClient: jest.fn(() => ({
        post: mockPost,
        get: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
    })),
}));

import { createStreamApi } from './streamApi';

describe('createStreamApi', () => {
    const auth: Auth = { type: 'key', clientKey: 'ck' };

    beforeEach(() => {
        mockPost.mockReset();
    });

    describe('sendStreamRequest', () => {
        it('should convert the snake_case wire response to a camelCase SpeakResponse', async () => {
            // ARRANGE:
            mockPost.mockResolvedValue({
                status: 'success',
                session_id: 'session-123',
                duration: 4200,
                video_id: 'video-123',
            });
            const api = createStreamApi(auth, 'http://localhost', 'agent-123');

            // ACT:
            const response = await api.sendStreamRequest('stream-123', 'session-123', {
                script: { type: 'text', input: 'Hello' },
            } as any);

            // ASSERT:
            expect(response).toEqual({
                status: 'success',
                sessionId: 'session-123',
                duration: 4200,
                videoId: 'video-123',
            });
        });

        it('should send the session id to the Agents API as session_id', async () => {
            // ARRANGE:
            mockPost.mockResolvedValue({ status: 'success', duration: 0, video_id: '' });
            const api = createStreamApi(auth, 'http://localhost', 'agent-123');

            // ACT:
            await api.sendStreamRequest('stream-123', 'session-123', { script: { type: 'text', input: 'Hi' } } as any);

            // ASSERT:
            expect(mockPost).toHaveBeenCalledWith(
                '/streams/stream-123',
                expect.objectContaining({ session_id: 'session-123' })
            );
        });
    });
});
