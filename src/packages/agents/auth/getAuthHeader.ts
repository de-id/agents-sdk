import { Auth } from '%/auth';

export function getAuthHeader(auth: Auth) {
    if (auth.type === 'bearer') {
        return `Bearer ${auth.token}`;
    } else if (auth.type === 'basic') {
        return `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
    } else if (auth.type === 'key') {
        return `Client-Key ${auth.clientKey}`;
    } else {
        throw new Error(`Unknown auth type: ${auth}`);
    }
}
