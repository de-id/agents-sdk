import { Auth } from '$/types/auth';

function getAuth(auth: Auth) {
    if (auth.type === 'bearer') {
        return 'Bearer ' + auth.token;
    } else if (auth.type === 'basic') {
        return 'Basic ' + btoa(`${auth.username}:${auth.password}`);
    }

    return 'Client-Key ' + auth.clientKey;
}

export function createClient(auth: Auth, host = 'https://api.d-id.com') {
    const client = async <T>(url: string, options?: RequestInit) => {
        const request = await fetch(host + (url?.startsWith('/') ? url : `/${url}`), {
            ...options,
            headers: {
                ...options?.headers,
                Authorization: getAuth(auth),
                'Content-Type': 'application/json',
            },
        });

        if (!request.ok) {
            let error: any = await request.text().catch(() => 'Failed to fetch');
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
