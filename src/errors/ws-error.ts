import { BaseError } from './base-error';

export class WSError extends BaseError {
    constructor(message: string) {
        super({ kind: 'WSError', description: message });
    }
}
