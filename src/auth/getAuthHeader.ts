import { Auth } from '$/types/auth';

export const getRandom = () => Math.random().toString(16).slice(2);
const externalIdTtl = 60000 * 60 * 24 * 3;

export function getExternalId() {
    let key : any = window.localStorage.getItem('did_external_key_id');

    if (!key || new Date().getTime() > JSON.parse(key)?.expiry) {
        key = {
            value: getRandom(),
            expiry: new Date().getTime() + externalIdTtl,
        }
        window.localStorage.setItem('did_external_key_id', JSON.stringify(key));
    }

    return JSON.parse(key).value;
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
