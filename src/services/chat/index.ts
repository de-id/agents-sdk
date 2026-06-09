import { PLAYGROUND_HEADER } from '@sdk/config/consts';
import { HttpError } from '@sdk/errors';
import type { Agent, AgentsAPI, Chat } from '@sdk/types';
import { ChatMode } from '@sdk/types';
import { isChatModeWithoutChat } from '@sdk/utils/chat';
import { Analytics } from '../analytics/mixpanel';

export function getRequestHeaders(chatMode?: ChatMode): { headers?: Record<string, string> } {
    return chatMode === ChatMode.Playground ? { headers: { [PLAYGROUND_HEADER]: 'true' } } : {};
}

export async function createChat(
    agent: Agent,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chatMode?: ChatMode,
    persist = false,
    chat?: Chat
) {
    try {
        if (!chat && !isChatModeWithoutChat(chatMode)) {
            chat = await agentsApi.newChat(agent.id, { persist }, getRequestHeaders(chatMode));

            analytics.track('agent-chat', {
                event: 'created',
                chatId: chat.id,
                mode: chatMode,
            });
        }

        return { chat, chatMode: chat?.chat_mode ?? chatMode };
    } catch (error) {
        const httpError = error instanceof HttpError ? error : undefined;

        if (httpError?.kind === 'InsufficientCreditsError') {
            throw new Error('InsufficientCreditsError');
        }

        // preserve the status so the connect-level retry guard can fail-fast on a 429
        const failure = new Error('Cannot create new chat') as Error & { status?: number };
        failure.status = httpError?.status;
        throw failure;
    }
}
