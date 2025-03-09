import { Agent, Message } from '$/types';
import { getRandom } from '$/utils';

export function getGreetings(agent: Agent) {
    const greetings = agent.greetings?.filter(greeting => greeting.length > 0) ?? [];

    if (greetings.length > 0) {
        return greetings[Math.floor(Math.random() * greetings.length)];
    }

    return `Hi! I'm ${agent.preview_name || 'My Agent'}. How can I help you?`;
}

export function getInitialMessages(content: string, initialMessages?: Message[]): Message[] {
    if (initialMessages && initialMessages.length > 0) {
        return initialMessages;
    }

    return [
        {
            content: content,
            id: getRandom(),
            role: 'assistant',
            created_at: new Date().toISOString(),
        },
    ];
}
