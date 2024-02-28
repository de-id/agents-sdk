import { Auth } from '$/types/auth';

function getExternalId() {
    let key = window.localStorage.getItem('external_key_d_id');

    if (!key) {
        key = Math.random().toString(16).slice(2);
        window.localStorage.setItem('external_key_d_id', key);
    }

    return key;
}

export function getAuthHeader(auth: Auth) {
    if (auth.type === 'bearer') {
        return `Bearer ${auth.token}`;
    } else if (auth.type === 'basic') {
        return `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
    } else if (auth.type === 'key') {
        return `Client-Key ${auth.clientKey}.${getExternalId()}`;
    } else {
        throw new Error(`Unknown auth type: ${auth}`);
    }
}
