import { Agent, AgentManagerOptions, Message } from '$/types';
import { getRandom } from '$/utils';
import { getAgentType } from '$/utils/agent';

function shouldGreet(agent: Agent, options: AgentManagerOptions): boolean {
    return !!(getAgentType(agent.presenter) !== 'clip' && options.streamOptions?.streamGreeting);
}

export function getGreetings(agent: Agent, options: AgentManagerOptions): string | undefined {
    if (!shouldGreet(agent, options)) {
        return;
    }

    const greetings = agent.greetings?.filter(greeting => greeting.length > 0) ?? [];

    if (!greetings.length) {
        return;
    }

    return greetings[Math.floor(Math.random() * greetings.length)];
}

export function getInitialMessages(content?: string, initialMessages?: Message[]): Message[] {
    if (initialMessages && initialMessages.length > 0) {
        return initialMessages;
    }

    if (!content) {
        return [];
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
