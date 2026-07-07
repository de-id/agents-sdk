import { ChatMode } from '@sdk/types';
import { BaseError } from '../base-error';

export class ChatModeDowngraded extends BaseError {
    constructor(mode: ChatMode) {
        super(`Chat mode downgraded to ${mode}`, 'ChatModeDowngraded');
    }
}
