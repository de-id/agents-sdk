import { ChatMode } from '$/types';
import { BaseError } from './base-error';

export class ChatModeDowngraded extends BaseError {
    constructor(mode: ChatMode) {
        super({ kind: 'ChatModeDowngraded', description: `Chat mode downgraded to ${mode}` });
    }
}
