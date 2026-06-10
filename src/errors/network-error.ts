import { BaseError } from './base-error';

// A transport-level failure: the request never got a response (offline / DNS / refused / TLS / CORS).
// Distinct from HttpError, which means the server *did* respond with a non-2xx status.
export class NetworkError extends BaseError {
    constructor(originalError?: unknown) {
        super('Network request failed', 'NetworkError', originalError);
    }
}
