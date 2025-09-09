import { Factory } from 'rosie';

import { Agent, Providers } from '../../types';

export const AgentFactory = new Factory<Agent>().attrs({
    id: 'agent-123',
    username: 'Test Agent',
    knowledge: {
        id: 'knowledge-123',
        starter_message: ['Hello!', 'How can I help?'],
        provider: 'pinecone' as const,
    },
    presenter: {
        type: 'talk' as const,
        source_url: 'https://example.com/presenter',
        voice: {
            type: Providers.Microsoft,
            voice_id: 'voice-123',
        },
    },
});
