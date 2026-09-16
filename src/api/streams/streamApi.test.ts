import { Auth } from '@sdk/types/auth';

const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock('../apiClient', () => ({
    createClient: jest.fn(() => ({
        post: mockPost,
        get: jest.fn(),
        patch: jest.fn(),
        delete: mockDelete,
    })),
}));

import { createStreamApi } from './streamApi';

describe('createStreamApi', () => {
    const auth: Auth = { type: 'key', clientKey: 'ck' };

    beforeEach(() => {
        mockPost.mockReset();
        mockDelete.mockReset();
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

    describe('close', () => {
        it('should send the session id to the Agents API as session_id', async () => {
            // ARRANGE:
            mockDelete.mockResolvedValue({ status: 'success' });
            const api = createStreamApi(auth, 'http://localhost', 'agent-123');

            // ACT:
            await api.close('stream-123', 'session-123');

            // ASSERT:
            expect(mockDelete).toHaveBeenCalledWith(
                '/streams/stream-123',
                { session_id: 'session-123' },
                expect.anything()
            );
        });

        // Regression test for https://github.com/de-id/agents-sdk/issues/367:
        // the session is routinely gone before this teardown request lands, and the resulting
        // `missing or invalid session_id` must not reach the application's onError reporter.
        it('should keep teardown failures out of the error handler', async () => {
            // ARRANGE:
            mockDelete.mockResolvedValue({ status: 'success' });
            const api = createStreamApi(auth, 'http://localhost', 'agent-123');

            // ACT:
            await api.close('stream-123', 'session-123');

            // ASSERT:
            expect(mockDelete).toHaveBeenCalledWith(
                '/streams/stream-123',
                expect.anything(),
                expect.objectContaining({ skipErrorHandler: true })
            );
        });
    });
});
