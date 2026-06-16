import { BaseError } from './base-error';

export class StreamError extends BaseError {
    constructor(message: string, originalError?: unknown) {
        super(message, 'StreamError', originalError);
    }
}
