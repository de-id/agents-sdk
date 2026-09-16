import { Auth } from '@sdk/types/auth';

jest.mock('../config/environment', () => ({ didApiUrl: 'http://test-api.com' }));

import { HttpError, NetworkError, isDIDError } from '../errors';
import { toErrorAnalytics } from '../utils/error-analytics';
import { createClient } from './apiClient';

interface FakeResponseInit {
    status?: number;
    statusText?: string;
    ok?: boolean;
    body?: unknown;
    bodyText?: string;
    headers?: Record<string, string>;
}

function fakeResponse(init: FakeResponseInit = {}) {
    const status = init.status ?? 200;
    return {
        ok: init.ok ?? (status >= 200 && status < 300),
        status,
        statusText: init.statusText ?? '',
        headers: new Map<string, string>([['content-type', 'application/json'], ...Object.entries(init.headers ?? {})]),
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
        jest.useRealTimers();
        (globalThis as unknown as { fetch: typeof originalFetch }).fetch = originalFetch;
    });

    it('should resolve with parsed JSON when the response is 2xx', async () => {
        fetchSpy.mockResolvedValue(fakeResponse({ body: { id: 'x' } }));
        const client = createClient(auth, 'https://api.example.com');
        await expect(client.get('/agents/x')).resolves.toEqual({ id: 'x' });
    });

    it('should throw an HttpError with the server code + status when the response is a non-2xx', async () => {
        const body = JSON.stringify({ kind: 'NotFoundError', description: 'agent not found' });
        fetchSpy.mockResolvedValue(fakeResponse({ status: 404, statusText: 'Not Found', bodyText: body }));
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        await expect(client.get('/agents/missing')).rejects.toBeInstanceOf(HttpError);

        expect(onError).toHaveBeenCalledTimes(1);
        const [err, data] = onError.mock.calls[0];
        expect(err.kind).toBe('HttpError');
        expect(err.code).toBe('NotFoundError'); // parsed from server envelope
        expect(err.message).toBe('agent not found');
        expect(err.status).toBe(404);
        expect(err.endpoint).toBe('/agents/missing');
        expect(err.method).toBe('GET');
        // `toEqual`, not `toMatchObject`: the context is exactly the request, with no options,
        // headers or body alongside it.
        expect(data).toEqual({ endpoint: '/agents/missing', method: 'GET' });
    });

    it('should throw an HttpError when the response is 5xx', async () => {
        fetchSpy.mockResolvedValue(fakeResponse({ status: 504, bodyText: 'gateway timeout' }));
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        const rejection = await client.post('/agents/x/chat', {}).catch(e => e);
        expect(rejection).toBeInstanceOf(HttpError);
        expect(rejection.status).toBe(504);
        expect(onError.mock.calls[0][1]).toEqual({ endpoint: '/agents/x/chat', method: 'POST' });
    });

    it('should retry a 429 and succeed when a later attempt is ok', async () => {
        jest.useFakeTimers();
        fetchSpy
            .mockResolvedValueOnce(fakeResponse({ status: 429, bodyText: 'slow down' }))
            .mockResolvedValueOnce(fakeResponse({ body: { id: 'x' } }));
        const client = createClient(auth, 'https://api.example.com');

        const pending = client.get('/agents/x');
        await jest.advanceTimersByTimeAsync(1000);

        await expect(pending).resolves.toEqual({ id: 'x' });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should surface a 429 as an HttpError after the retries are exhausted', async () => {
        jest.useFakeTimers();
        fetchSpy.mockResolvedValue(fakeResponse({ status: 429, bodyText: 'slow down' }));
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        const rejection = client.get('/agents/x').catch(e => e);
        await jest.advanceTimersByTimeAsync(2000);

        const error = await rejection;
        expect(error).toBeInstanceOf(HttpError);
        expect(error.status).toBe(429);
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it('should wrap a network-level fetch rejection as a NetworkError', async () => {
        const networkError = new TypeError('Failed to fetch');
        fetchSpy.mockRejectedValue(networkError);
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        const rejection = await client.get('/agents/x').catch(e => e);
        expect(rejection).toBeInstanceOf(NetworkError);
        expect(rejection.kind).toBe('NetworkError');
        expect(rejection.originalError).toBe(networkError);

        expect(onError).toHaveBeenCalledTimes(1);
        const [err, data] = onError.mock.calls[0];
        expect(err.kind).toBe('NetworkError');
        expect(data).toEqual({ endpoint: '/agents/x', method: 'GET' });
    });

    it('should not route AbortError through onError when the request is cancelled', async () => {
        const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
        fetchSpy.mockRejectedValue(abortError);
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        await expect(client.get('/agents/x')).rejects.toBe(abortError);
        expect(onError).not.toHaveBeenCalled();
    });

    it('should skip onError when skipErrorHandler is set on a network rejection', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        await expect(client.get('/agents/x', { skipErrorHandler: true })).rejects.toThrow();
        expect(onError).not.toHaveBeenCalled();
    });

    it('should skip onError when skipErrorHandler is set on an HTTP error', async () => {
        fetchSpy.mockResolvedValue(fakeResponse({ status: 500, bodyText: 'boom' }));
        const onError = jest.fn();
        const client = createClient(auth, 'https://api.example.com', onError);

        await expect(client.get('/agents/x', { skipErrorHandler: true })).rejects.toThrow();
        expect(onError).not.toHaveBeenCalled();
    });

    it('should still raise the wrapped error when no onError is supplied', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
        const client = createClient(auth, 'https://api.example.com');
        const rejection = await client.get('/agents/x').catch(e => e);
        expect(rejection).toBeInstanceOf(NetworkError);
        expect(rejection.kind).toBe('NetworkError');
    });

    describe('end-to-end: thrown error → analytics payload', () => {
        it('should produce a kind/status/endpoint/method payload when the request is an HTTP error', async () => {
            const body = JSON.stringify({ kind: 'NotFoundError', description: 'agent not found' });
            fetchSpy.mockResolvedValue(fakeResponse({ status: 404, bodyText: body }));
            const client = createClient(auth, 'https://api.example.com');

            const rejection = await client.get('/agents/missing').catch(e => e);
            expect(toErrorAnalytics(rejection)).toEqual({
                kind: 'HttpError',
                code: 'NotFoundError',
                message: 'agent not found',
                httpStatus: 404,
                endpoint: '/agents/missing',
                method: 'GET',
            });
        });

        it('should produce a NetworkError payload with the browser cause + captured signals when fetch rejects', async () => {
            fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
            const client = createClient(auth, 'https://api.example.com');

            const rejection = await client.get('/agents/x').catch(e => e);
            const payload = toErrorAnalytics(rejection);
            expect(payload).toMatchObject({
                kind: 'NetworkError',
                message: 'Network request failed',
                cause: 'Failed to fetch',
                endpoint: '/agents/x',
                method: 'GET',
                online: true, // jsdom default
                visibility: 'visible', // jsdom default
            });
            expect(payload.durationMs).toEqual(expect.any(Number));
        });
    });

    describe('typed error contract for consumers', () => {
        it('should expose an HTTP error with the server code, status, and a human message', async () => {
            const body = JSON.stringify({ kind: 'InsufficientCreditsError', description: 'no credits' });
            fetchSpy.mockResolvedValue(fakeResponse({ status: 402, bodyText: body }));
            const client = createClient(auth, 'https://api.example.com');

            const error = await client.get('/agents/x').catch(e => e);
            expect(isDIDError(error)).toBe(true);
            expect(error).toBeInstanceOf(HttpError);
            expect(error.kind).toBe('HttpError');
            expect(error.code).toBe('InsufficientCreditsError');
            expect(error.status).toBe(402);
            expect(error.message).toBe('no credits');
        });

        it('should expose a transport failure as a NetworkError', async () => {
            fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
            const client = createClient(auth, 'https://api.example.com');

            const error = await client.get('/agents/x').catch(e => e);
            expect(isDIDError(error)).toBe(true);
            expect(error).toBeInstanceOf(NetworkError);
            expect(error.kind).toBe('NetworkError');
        });
    });
});
