import { ChatMode } from '@sdk/types';
import { BaseError } from '../base-error';

export class ChatCreationFailed extends BaseError {
    constructor(mode: ChatMode, persistent: boolean) {
        super(`Failed to create ${persistent ? 'persistent' : ''} chat, mode: ${mode}`, 'ChatCreationFailed');
    }
}
