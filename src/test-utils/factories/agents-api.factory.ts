import { Factory } from 'rosie';

import { AgentFactory } from './agent.factory';

export const AgentsApiFactory = new Factory().attrs({
    getRuntimeById: () => jest.fn().mockResolvedValue(AgentFactory.build()),
    getSTTToken: () => jest.fn().mockResolvedValue({ token: 'stt-token' }),
    chat: () => jest.fn().mockResolvedValue({ result: 'Agent response', context: 'test context', matches: [] }),
    createRating: () => jest.fn().mockResolvedValue({ id: 'rating-123' }),
    updateRating: () => jest.fn().mockResolvedValue({ id: 'rating-123' }),
    deleteRating: () => jest.fn().mockResolvedValue(undefined),
    submitFeedback: () => jest.fn().mockResolvedValue({ chat_id: 'chat-123', rating: 4, submitted_at: 'now' }),
});
