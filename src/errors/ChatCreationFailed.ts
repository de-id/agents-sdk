import { ChatMode } from '$/types';
import { BaseError } from './baseError';

export class ChatCreationFailed extends BaseError {
    constructor(mode: ChatMode, persistent: boolean) {
        super({
            kind: 'ChatCreationFailed',
            description: `Failed to create ${persistent ? 'persistent' : ''} chat, mode: ${mode}`,
        });
    }
}
