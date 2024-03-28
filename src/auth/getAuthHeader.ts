import { Auth } from '$/types/auth';

const getRandom = () => Math.random().toString(16).slice(2);
export function getExternalId() {
    let key = window.localStorage.getItem('did_external_key_id');

    if (!key) {
        key = Math.random().toString(16).slice(2);
        window.localStorage.setItem('did_external_key_id', key);
    }

    return key;
}

let sessionKey = getRandom();
export function getAuthHeader(auth: Auth) {
    if (auth.type === 'bearer') {
        return `Bearer ${auth.token}`;
    } else if (auth.type === 'basic') {
        return `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
    } else if (auth.type === 'key') {
        return `Client-Key ${auth.clientKey}.${getExternalId()}_${sessionKey}`;
    } else {
        throw new Error(`Unknown auth type: ${auth}`);
    }
}
