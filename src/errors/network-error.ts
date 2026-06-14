import { BaseError, ErrorJson } from './base-error';

export interface NetworkErrorMeta {
    url?: string;
    method?: string;
    durationMs?: number;
    online?: boolean;
    visibility?: DocumentVisibilityState;
}

// Transport failure: fetch rejected with no response. Distinct from HttpError (server responded non-2xx).
export class NetworkError extends BaseError {
    readonly endpoint?: string;
    readonly method?: string;
    readonly durationMs?: number;
    readonly online?: boolean;
    readonly visibility?: DocumentVisibilityState;

    constructor(originalError?: unknown, meta: NetworkErrorMeta = {}) {
        super('Network request failed', 'NetworkError', originalError);
        this.endpoint = meta.url;
        this.method = meta.method;
        this.durationMs = meta.durationMs;
        this.online = meta.online;
        this.visibility = meta.visibility;
    }

    toJson(): ErrorJson {
        return {
            ...super.toJson(),
            ...(this.endpoint ? { endpoint: this.endpoint } : {}),
            ...(this.method ? { method: this.method } : {}),
            ...(this.durationMs !== undefined ? { durationMs: this.durationMs } : {}),
            ...(this.online !== undefined ? { online: this.online } : {}),
            ...(this.visibility ? { visibility: this.visibility } : {}),
        };
    }
}
