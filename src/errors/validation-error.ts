import { BaseError } from './base-error';

export class ValidationError extends BaseError {
    key?: string;

    constructor(message: string, key?: string) {
        super({ kind: 'ValidationError', description: message });

        this.key = key;
    }
}
