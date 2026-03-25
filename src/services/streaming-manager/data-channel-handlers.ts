import { ChatProgress } from '@sdk/types/entities/agents/manager';
import { StreamEvents } from '@sdk/types/stream';

export const chatEventMap: Record<string, ChatProgress> = {
    [StreamEvents.ChatAnswer]: ChatProgress.Answer,
    [StreamEvents.ChatPartial]: ChatProgress.Partial,
};
