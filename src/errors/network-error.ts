import { BaseError, ErrorJson } from './base-error';
import { RequestMeta } from './request-meta';

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
    constructor(originalError?: unknown, meta: RequestMeta = {}) {
        super('Network request failed', 'NetworkError', originalError);
        // Naming drift kept on purpose: `HttpError` exposes the same value as `url`, and both
        // serialize it as `endpoint` in toJson(). Renaming either property is a breaking change.
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
