import { BaseError } from './base-error';

export class WsError extends BaseError {
    constructor(message: string) {
        super(message, 'WSError');
    }
}
