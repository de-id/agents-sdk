import { BaseError } from './base-error';

// Transport failure: fetch rejected with no response. Distinct from HttpError (server responded non-2xx).
export class NetworkError extends BaseError {
    constructor(originalError?: unknown) {
        super('Network request failed', 'NetworkError', originalError);
    }
}
