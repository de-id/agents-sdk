import { Message } from '@sdk/types';
import { parseMessageParts } from '@sdk/utils/content-parser';

export function getInitialMessages(initialMessages?: Message[]): Message[] {
    if (!initialMessages || initialMessages.length === 0) {
        return [];
    }

    // A restored transcript usually carries only `content`; without parts a UI that renders parts
    // shows nothing for it. Anything the caller did build itself is left alone.
    return initialMessages.map(message =>
        Array.isArray(message.parts) && message.parts.length > 0
            ? message
            : { ...message, parts: parseMessageParts(typeof message.content === 'string' ? message.content : '') }
    );
}
