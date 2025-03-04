import { AgentManagerOptions, ChatProgress } from '$/types';
import { AgentManagerItems } from '../agent-manager';

export interface ChatEventQueue {
    [sequence: number]: string;
    answer?: string;
}

function getMessageContent(chatEventQueue: ChatEventQueue) {
    if (chatEventQueue['answer'] !== undefined) {
        return chatEventQueue['answer'];
    }

    let currentSequence = 0;
    let content = '';

    while (currentSequence in chatEventQueue) {
        content += chatEventQueue[currentSequence++];
    }

    return content;
}

export function processChatEvent(
    event: ChatProgress,
    data: any,
    chatEventQueue: ChatEventQueue,
    items: AgentManagerItems,
    onNewMessage: AgentManagerOptions['callbacks']['onNewMessage']
) {
    const lastMessage = items.messages[items.messages.length - 1];

    if (!(event === ChatProgress.Partial || event === ChatProgress.Answer) || lastMessage?.role !== 'assistant') {
        return;
    }

    const { content, sequence } = data;

    if (event === ChatProgress.Partial) {
        chatEventQueue[sequence] = content;
    } else {
        chatEventQueue['answer'] = content;
    }

    const messageContent = getMessageContent(chatEventQueue);

    if (lastMessage.content !== messageContent || event === ChatProgress.Answer) {
        lastMessage.content = messageContent;

        onNewMessage?.([...items.messages], event);
    }
}
