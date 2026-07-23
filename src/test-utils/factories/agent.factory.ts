import { Factory } from 'rosie';

import { Agent } from '../../types';

export const AgentFactory = new Factory<Agent>().attrs({
    id: 'agent-123',
    name: 'Test Agent',
    knowledge: {
        id: 'knowledge-123',
    },
    starter_message: ['Hello!', 'How can I help?'],
    avatar: {
        type: 'talk' as const,
        voice: {
            language: 'en-US',
        },
    },
});

export const StreamingAgentFactory = new Factory().attrs({
    stream_warmup: false,
    stream_type: 'talk' as const,
});
