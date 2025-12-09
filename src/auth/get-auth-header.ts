import { Auth } from '@sdk/types/auth';
import { getRandom } from '@sdk/utils';

export function getExternalId(externalId?: string): string {
    if (externalId !== undefined) {
        window.localStorage.setItem('did_external_key_id', externalId);
        return externalId;
    }

    let key = window.localStorage.getItem('did_external_key_id');

    if (!key) {
        let newKey = getRandom();
        window.localStorage.setItem('did_external_key_id', newKey);
        key = newKey;
    }

    return key;
}

let sessionKey = getRandom();
export function getAuthHeader(auth: Auth, externalId?: string) {
    if (auth.type === 'bearer') {
        return `Bearer ${auth.token}`;
    } else if (auth.type === 'basic') {
        return `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
    } else if (auth.type === 'key') {
        return `Client-Key ${auth.clientKey}.${getExternalId(externalId)}_${sessionKey}`;
    } else {
        throw new Error(`Unknown auth type: ${auth}`);
    }
}
