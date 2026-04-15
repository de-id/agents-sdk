import { Factory } from 'rosie';

import { Agent, Providers, VideoType } from '../../types';

export const AgentFactory = new Factory<Agent>().attrs({
    id: 'agent-123',
    username: 'Test Agent',
    knowledge: {
        id: 'knowledge-123',
        starter_message: ['Hello!', 'How can I help?'],
        provider: 'pinecone' as const,
    },
    presenter: {
        type: VideoType.Talk,
        source_url: 'https://example.com/presenter',
        voice: {
            type: Providers.Microsoft,
            voice_id: 'voice-123',
        },
    },
});

export const StreamingAgentFactory = new Factory().attrs({
    stream_warmup: false,
    stream_type: 'talk' as const,
});
