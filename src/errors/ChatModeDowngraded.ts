import { ChatMode } from '$/types';
import { BaseError } from './baseError';

export class ChatModeDowngraded extends BaseError {
    constructor(mode: ChatMode) {
        super({ kind: 'ChatModeDowngraded', description: `Chat mode downgraded to ${mode}` });
    }
}
