jest.mock('@sdk/config/environment', () => ({
    didApiUrl: 'http://test-api.com',
    didSocketApiUrl: 'ws://test-api.com',
    mixpanelKey: 'k',
}));
jest.mock('@sdk/utils/chat', () => ({ isChatModeWithoutChat: () => false }));

import { HttpError } from '../../errors';
import { createChat } from './index';

describe('createChat error mapping', () => {
    const agent = { id: 'a1' } as any;
    const analytics = { track: jest.fn() } as any;
    const api = (error: unknown) => ({ newChat: jest.fn().mockRejectedValue(error) }) as any;

    it('should rethrow the InsufficientCreditsError sentinel when the server reports insufficient credits', async () => {
        const body = JSON.stringify({ kind: 'InsufficientCreditsError', description: 'no credits' });
        await expect(createChat(agent, api(new HttpError(402, body)), analytics)).rejects.toThrow(
            'InsufficientCreditsError'
        );
    });

    it('should map other failures to "Cannot create new chat" and preserve the status when it is a 429', async () => {
        const error = await createChat(agent, api(new HttpError(429, 'slow down')), analytics).catch(e => e);
        expect(error.message).toBe('Cannot create new chat');
        expect(error.status).toBe(429);
    });

    it('should not attach a status when the failure is not an HttpError', async () => {
        const error = await createChat(agent, api(new Error('boom')), analytics).catch(e => e);
        expect(error.message).toBe('Cannot create new chat');
        expect(error.status).toBeUndefined();
    });
});
