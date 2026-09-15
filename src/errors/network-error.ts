import { BaseError, ErrorJson } from './base-error';

/**
 * Request context recorded on a {@link NetworkError} when a fetch fails without a response.
 * @internal Implementation type; not part of the public SDK surface.
 */
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

    /**
     * Wraps a transport failure together with the request context recorded at the call site.
     *
     * The SDK constructs `NetworkError` itself; applications receive instances through `onError`
     * and rejected promises rather than calling this.
     *
     * @param originalError - The rejection thrown by `fetch`, kept as the error's cause.
     * @param meta - Request context captured when the attempt failed.
     * @internal Constructed by the SDK; not part of the public SDK surface.
     */
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
