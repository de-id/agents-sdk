import { BaseError } from './base-error';

export class WsError extends BaseError {
    constructor(message: string) {
        super({ kind: 'WSError', description: message });
    }
}
