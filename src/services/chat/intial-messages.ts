import { Message } from '@sdk/types';

export function getInitialMessages(initialMessages?: Message[]): Message[] {
    if (initialMessages && initialMessages.length > 0) {
        return initialMessages;
    }

    return [];
}
