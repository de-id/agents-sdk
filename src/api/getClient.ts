import { Auth } from '$/types/auth';
import retryOperation from '$/utils/retryOperation';
import { getAuthHeader } from '../auth/getAuthHeader';
import { didApiUrl } from '../environment';

const retryHttpTooManyRequests = <T>(operation: () => Promise<T>): Promise<T> =>
    retryOperation(operation, {
        limit: 3,
        delayMs: 1000,
        timeout: 0,
        shouldRetryFn: error => error.status === 429,
    });

export function createClient(auth: Auth, host = didApiUrl, onError?: (error: Error, errorData: object) => void) {
    const client = async <T>(url: string, options?: RequestInit) => {
        const request = await retryHttpTooManyRequests(() =>
            fetch(host + (url?.startsWith('/') ? url : `/${url}`), {
                ...options,
                headers: {
                    ...options?.headers,
                    Authorization: getAuthHeader(auth),
                    'Content-Type': 'application/json',
                },
            })
        );

        if (!request.ok) {
            let error: any = await request.text().catch(() => 'Failed to fetch');
            if (onError) {
                onError(new Error(error), { url, options, headers: request.headers });
            }
            throw new Error(error);
        }

        return request.json() as Promise<T>;
    };

    return {
        get<T = any>(url: string, options?: RequestInit) {
            return client<T>(url, { ...options, method: 'GET' });
        },
        post<T = any>(url: string, body?: any, options?: RequestInit) {
            return client<T>(url, { ...options, body: JSON.stringify(body), method: 'POST' });
        },
        delete<T = any>(url: string, body?: any, options?: RequestInit) {
            return client<T>(url, { ...options, body: JSON.stringify(body), method: 'DELETE' });
        },
        patch<T = any>(url: string, body?: any, options?: RequestInit) {
            return client<T>(url, { ...options, body: JSON.stringify(body), method: 'PATCH' });
        },
    };
}
