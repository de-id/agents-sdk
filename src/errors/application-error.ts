import { BaseError } from './base-error';

export class ApplicationError extends BaseError {
    constructor(message: string, originalError?: unknown) {
        super(message || 'UnknownError', 'ApplicationError', originalError);
    }
}
