import { HttpError, NetworkError } from '@sdk/errors';
import { Auth } from '@sdk/types/auth';
import { retryOperation } from '@sdk/utils/retry-operation';
import { getAuthHeader } from '../auth/get-auth-header';
import { didApiUrl } from '../config/environment';

export type RequestOptions = RequestInit & {
    skipErrorHandler?: boolean;
};

const retryHttpTooManyRequests = <T>(operation: () => Promise<T>): Promise<T> =>
    retryOperation(operation, {
        limit: 3,
        delayMs: 1000,
        timeout: 0,
        shouldRetryFn: error => error.status === 429,
    });

export function createClient(
    auth: Auth,
    host = didApiUrl,
    onError?: (error: Error, errorData: object) => void,
    externalId?: string
) {
    const client = async <T>(url: string, options?: RequestOptions) => {
        const { skipErrorHandler, ...fetchOptions } = options || {};

        let request: Response;
        try {
            request = await retryHttpTooManyRequests(() =>
                fetch(host + (url?.startsWith('/') ? url : `/${url}`), {
                    ...fetchOptions,
                    headers: {
                        ...fetchOptions.headers,
                        Authorization: getAuthHeader(auth, externalId),
                        'Content-Type': 'application/json',
                    },
                })
            );
        } catch (networkError) {
            // no response reached us (offline / DNS / refused / TLS / CORS); AbortError is a cancellation
            const isAbort = (networkError as { name?: string })?.name === 'AbortError';
            if (isAbort) {
                throw networkError;
            }

            const error = new NetworkError(networkError);
            if (!skipErrorHandler) {
                onError?.(error, { url, options: fetchOptions });
            }
            throw error;
        }

        if (!request.ok) {
            const errorText = await request.text().catch(() => `Failed to fetch with status ${request.status}`);
            const error = new HttpError(request.status, errorText, { url, method: fetchOptions.method ?? 'GET' });

            if (!skipErrorHandler) {
                onError?.(error, { url, options: fetchOptions, headers: request.headers });
            }

            throw error;
        }

        return request.json() as Promise<T>;
    };

    return {
        get<T = any>(url: string, options?: RequestOptions) {
            return client<T>(url, { ...options, method: 'GET' });
        },
        post<T = any>(url: string, body?: any, options?: RequestOptions) {
            return client<T>(url, { ...options, body: JSON.stringify(body), method: 'POST' });
        },
        delete<T = any>(url: string, body?: any, options?: RequestOptions) {
            return client<T>(url, { ...options, body: JSON.stringify(body), method: 'DELETE' });
        },
        patch<T = any>(url: string, body?: any, options?: RequestOptions) {
            return client<T>(url, { ...options, body: JSON.stringify(body), method: 'PATCH' });
        },
    };
}
