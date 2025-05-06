import { Message } from '$/types';

export function getInitialMessages(initialMessages?: Message[]): Message[] {
    if (initialMessages && initialMessages.length > 0) {
        return initialMessages;
    }

    return [];
}
