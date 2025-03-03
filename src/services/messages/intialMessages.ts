import { getRandom } from "$/auth/getAuthHeader";
import { Agent, Message } from "$/types";

function getGreetings(agent: Agent) {
    const greetings = agent.greetings?.filter(greeting => greeting.length > 0) ?? [];

    if (greetings.length > 0) {
        return greetings[Math.floor(Math.random() * greetings.length)];
    } else {
        return `Hi! I'm ${agent.preview_name || 'My Agent'}. How can I help you?`;
    }
}

export function getInitialMessages(agent: Agent, initialMessages?: Message[]): Message[] {
    if (initialMessages && initialMessages.length > 0) {
        return initialMessages;
    }

    return [
        {
            content: getGreetings(agent),
            id: getRandom(),
            role: 'assistant',
            created_at: new Date().toISOString(),
        },
    ];
}
