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
            // Network-level rejection — TypeError ("Failed to fetch"), DNS failure, offline,
            // CORS preflight failure, etc. The HTTP-error branch below is unreachable in this
            // case, so route the error through onError here so consumers learn about it.
            // AbortError is excluded — those are intentional cancellations, not failures.
            const isAbort = (networkError as { name?: string })?.name === 'AbortError';
            if (!isAbort && onError && !skipErrorHandler) {
                onError(networkError as Error, { url, options: fetchOptions });
            }
            throw networkError;
        }

        if (!request.ok) {
            let errorText: any = await request.text().catch(() => `Failed to fetch with status ${request.status}`);
            const error = new Error(errorText);

            if (onError && !skipErrorHandler) {
                onError(error, { url, options: fetchOptions, headers: request.headers });
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
