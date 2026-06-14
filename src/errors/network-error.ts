import { BaseError, ErrorJson } from './base-error';

// Transport failure: fetch rejected with no response. Distinct from HttpError (server responded non-2xx).
export class NetworkError extends BaseError {
    readonly endpoint?: string;
    readonly method?: string;

    constructor(originalError?: unknown, meta: { url?: string; method?: string } = {}) {
        super('Network request failed', 'NetworkError', originalError);
        this.endpoint = meta.url;
        this.method = meta.method;
    }

    toJson(): ErrorJson {
        return {
            ...super.toJson(),
            ...(this.endpoint ? { endpoint: this.endpoint } : {}),
            ...(this.method ? { method: this.method } : {}),
        };
    }
}
