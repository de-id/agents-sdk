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

// Per-connection routing id, shared by WS and HTTP. Rotated by rotateConnectionId().
// Carried in every auth header so the notifications WS adapter routes messages
// per-connection instead of collapsing clients that share a bearer/basic credential.
// Client-Key appends it after the external_id (`_<id>`); bearer/basic append it after
// a `~` delimiter, which the authorizer strips before validating the token.
// Generated on first use, not at module evaluation: `getRandom()` needs `crypto`,
// and importing the package must not depend on a browser being present.
let connectionId: string | undefined;

function getConnectionId(): string {
    return (connectionId ??= getRandom());
}

export function rotateConnectionId() {
    connectionId = getRandom();
}

export function getAuthHeader(auth: Auth, externalId?: string) {
    if (auth.type === 'bearer') {
        return `Bearer ${auth.token}~${getConnectionId()}`;
    } else if (auth.type === 'basic') {
        const credentials = 'token' in auth ? auth.token : btoa(`${auth.username}:${auth.password}`);
        return `Basic ${credentials}~${getConnectionId()}`;
    } else if (auth.type === 'key') {
        return `Client-Key ${auth.clientKey}.${getExternalId(externalId)}_${getConnectionId()}`;
    } else {
        throw new Error(`Unknown auth type: ${auth}`);
    }
}
