import { HttpError, NetworkError } from '@sdk/errors';
import { Auth } from '@sdk/types/auth';
import { ErrorReporter } from '@sdk/types/error-context';
import { retryOperation } from '@sdk/utils/retry-operation';
import { getAuthHeader } from '../auth/get-auth-header';
import { didApiUrl } from '../config/environment';

export type RequestOptions = RequestInit & {
    skipErrorHandler?: boolean;
};

/**
 * Internal marker thrown from the retried fetch so `retryOperation` sees a 429 as a failure.
 * `fetch` resolves on a 429, so without this the retry predicate would never match.
 */
class TooManyRequests {
    readonly status = 429;

    constructor(readonly response: Response) {}
}

const retryHttpTooManyRequests = <T>(operation: () => Promise<T>): Promise<T> =>
    retryOperation(operation, {
        limit: 3,
        delayMs: 1000,
        timeout: 0,
        shouldRetryFn: error => error.status === 429,
    });

export function createClient(auth: Auth, host = didApiUrl, onError?: ErrorReporter, externalId?: string) {
    const client = async <T>(url: string, options?: RequestOptions) => {
        const { skipErrorHandler, ...fetchOptions } = options || {};
        const method = fetchOptions.method ?? 'GET';
        const start = performance.now();

        let request: Response;
        try {
            request = await retryHttpTooManyRequests(async () => {
                const response = await fetch(host + (url?.startsWith('/') ? url : `/${url}`), {
                    ...fetchOptions,
                    headers: {
                        ...fetchOptions.headers,
                        Authorization: getAuthHeader(auth, externalId),
                        'Content-Type': 'application/json',
                    },
                });

                if (response.status === 429) {
                    throw new TooManyRequests(response);
                }

                return response;
            });
        } catch (networkError) {
            if (networkError instanceof TooManyRequests) {
                // retries are exhausted; let the rate-limited response take the normal HttpError path
                request = networkError.response;
            } else {
                // no response reached us (offline / DNS / refused / TLS / CORS); AbortError is a cancellation
                const isAbort = (networkError as { name?: string })?.name === 'AbortError';
                if (isAbort) {
                    throw networkError;
                }

                const error = new NetworkError(networkError, {
                    endpoint: url,
                    method,
                    durationMs: Math.round(performance.now() - start),
                    online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
                    visibility: typeof document !== 'undefined' ? document.visibilityState : undefined,
                });
                if (!skipErrorHandler) {
                    onError?.(error, { endpoint: url, method });
                }
                throw error;
            }
        }

        if (!request.ok) {
            const errorText = await request.text().catch(() => `Failed to fetch with status ${request.status}`);
            const error = new HttpError(request.status, errorText, { endpoint: url, method });

            if (!skipErrorHandler) {
                onError?.(error, { endpoint: url, method });
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
