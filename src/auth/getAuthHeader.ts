import { Auth } from '$/types/auth';

export const getRandom = () => Math.random().toString(16).slice(2);
const externalIdTtl = 60000 * 60 * 24 * 3; //3 days
const EXTERNAL_ID = "did_external_key_id"

export function getExternalId() {
    let stringyKey : any = window.localStorage.getItem(EXTERNAL_ID);
    let key = !!stringyKey && JSON.parse(stringyKey)
    
    if (!key || new Date().getTime() > key.expiry) {
        key = {
            value: getRandom(),
            expiry: new Date().getTime() + externalIdTtl,
        }
        window.localStorage.setItem(EXTERNAL_ID, JSON.stringify(key));
    }

    return key.value;
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
