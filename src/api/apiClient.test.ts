import { Auth } from '@sdk/types/auth';

jest.mock('../config/environment', () => ({ didApiUrl: 'http://test-api.com' }));

import { createClient } from './apiClient';

interface FakeResponseInit {
    status?: number;
    ok?: boolean;
    body?: unknown;
    bodyText?: string;
}

function fakeResponse(init: FakeResponseInit = {}) {
    const status = init.status ?? 200;
    return {
        ok: init.ok ?? (status >= 200 && status < 300),
        status,
        headers: new Map([['content-type', 'application/json']]),
        json: jest.fn().mockResolvedValue(init.body ?? {}),
        text: jest.fn().mockResolvedValue(init.bodyText ?? JSON.stringify(init.body ?? '')),
    };
}

describe('createClient', () => {
    const auth: Auth = { type: 'key', clientKey: 'ck' };
    const originalFetch = globalThis.fetch;
    let fetchSpy: jest.Mock;

    beforeEach(() => {
        fetchSpy = jest.fn();
        (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchSpy;
    });

    afterEach(() => {
        (globalThis as unknown as { fetch: typeof originalFetch }).fetch = originalFetch;
    });

    it('resolves with parsed JSON on a 2xx response', async () => {
        fetchSpy.mockResolvedValue(fakeResponse({ body: { id: 'x' } }));
        const client = createClient(auth, 'https://api.example.com');
        await expect(client.get('/agents/x')).resolves.toEqual({ id: 'x' });
    });

    it('routes HTTP error responses through onError with url + options + headers', async () => {
        fetchSpy.mockResolvedValue(fakeResponse({ status: 404, bodyText: 'NotFound' }));
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        await expect(client.get('/agents/missing')).rejects.toThrow('NotFound');

        expect(onError).toHaveBeenCalledTimes(1);
        const [err, data] = onError.mock.calls[0];
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('NotFound');
        expect(data).toMatchObject({ url: '/agents/missing' });
        expect(data.headers).toBeDefined();
    });

    it('routes network-level fetch rejections through onError (TypeError)', async () => {
        const networkError = new TypeError('Failed to fetch');
        fetchSpy.mockRejectedValue(networkError);
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        await expect(client.get('/agents/x')).rejects.toBe(networkError);

        expect(onError).toHaveBeenCalledTimes(1);
        const [err, data] = onError.mock.calls[0];
        expect(err).toBe(networkError);
        expect(data).toMatchObject({ url: '/agents/x' });
        // Network failures have no Response, so `headers` is intentionally absent.
        expect(data).not.toHaveProperty('headers');
    });

    it('does NOT route AbortError rejections through onError (cancellations are not errors)', async () => {
        const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
        fetchSpy.mockRejectedValue(abortError);
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        await expect(client.get('/agents/x')).rejects.toBe(abortError);
        expect(onError).not.toHaveBeenCalled();
    });

    it('honors skipErrorHandler for network-level rejections', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        await expect(client.get('/agents/x', { skipErrorHandler: true })).rejects.toThrow();
        expect(onError).not.toHaveBeenCalled();
    });

    it('honors skipErrorHandler for HTTP error responses', async () => {
        fetchSpy.mockResolvedValue(fakeResponse({ status: 500, bodyText: 'boom' }));
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        await expect(client.get('/agents/x', { skipErrorHandler: true })).rejects.toThrow();
        expect(onError).not.toHaveBeenCalled();
    });

    it('does not throw when no onError is supplied (network rejection still propagates)', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
        const client = createClient(auth, 'https://api.example.com');
        await expect(client.get('/agents/x')).rejects.toThrow('Failed to fetch');
    });
});
