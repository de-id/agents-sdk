jest.mock('@sdk/config/environment', () => ({
    didApiUrl: 'http://test-api.com',
    didSocketApiUrl: 'ws://test-api.com',
    mixpanelKey: 'k',
}));
jest.mock('@sdk/utils/chat', () => ({ isChatModeWithoutChat: () => false }));

import { HttpError } from '../../errors';
import { createChat } from './index';

describe('createChat', () => {
    const agent = { id: 'a1' } as any;
    const analytics = { track: jest.fn() } as any;
    const api = (error: unknown) => ({ newChat: jest.fn().mockRejectedValue(error) }) as any;

    it('should propagate a typed HttpError untouched (kind + status intact for the connect guard)', async () => {
        const body = JSON.stringify({ kind: 'InsufficientCreditsError', description: 'no credits' });
        const httpError = new HttpError(402, body);
        const error = await createChat(agent, api(httpError), analytics).catch(e => e);
        expect(error).toBe(httpError);
        expect(error.kind).toBe('InsufficientCreditsError');
        expect(error.status).toBe(402);
    });

    it('should propagate a 429 HttpError with its status', async () => {
        const httpError = new HttpError(429, 'slow down');
        const error = await createChat(agent, api(httpError), analytics).catch(e => e);
        expect(error).toBe(httpError);
        expect(error.status).toBe(429);
    });

    it('should propagate a non-HttpError failure as-is', async () => {
        const original = new Error('boom');
        await expect(createChat(agent, api(original), analytics)).rejects.toBe(original);
    });
});
