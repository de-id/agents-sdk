import { Auth } from '$/types/auth';
import { retryOperation } from '$/utils/retry-operation';
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

export function createClient(auth: Auth, host = didApiUrl, onError?: (error: Error, errorData: object) => void) {
    const client = async <T>(url: string, options?: RequestOptions) => {
        const { skipErrorHandler, ...fetchOptions } = options || {};

        const request = await retryHttpTooManyRequests(() =>
            fetch(host + (url?.startsWith('/') ? url : `/${url}`), {
                ...fetchOptions,
                headers: {
                    ...fetchOptions.headers,
                    Authorization: getAuthHeader(auth),
                    'Content-Type': 'application/json',
                },
            })
        );

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
        put<T = any>(url: string, body?: any, options?: RequestOptions) {
            return client<T>(url, { ...options, body: JSON.stringify(body), method: 'PUT' });
        },
        delete<T = any>(url: string, body?: any, options?: RequestOptions) {
            return client<T>(url, { ...options, body: JSON.stringify(body), method: 'DELETE' });
        },
        patch<T = any>(url: string, body?: any, options?: RequestOptions) {
            return client<T>(url, { ...options, body: JSON.stringify(body), method: 'PATCH' });
        },
    };
}
