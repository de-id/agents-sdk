import { BaseError } from './base-error';

export class ValidationError extends BaseError {
    constructor(
        message: string,
        public readonly key?: string
    ) {
        super(message, 'ValidationError');
    }
}
