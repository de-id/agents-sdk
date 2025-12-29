import { PLAYGROUND_HEADER } from '@sdk/config/consts';
import type { Agent, AgentsAPI, Chat } from '@sdk/types';
import { ChatMode } from '@sdk/types';
import { isChatModeWithoutChat } from '@sdk/utils/chat';
import { Analytics } from '../analytics/mixpanel';

export function getRequestHeaders(chatMode?: ChatMode): Record<string, Record<string, string>> {
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
    } catch (error: any) {
        const errorKind = getErrorKind(error);
        if (errorKind === 'InsufficientCreditsError') {
            throw new Error('InsufficientCreditsError');
        }
        throw new Error('Cannot create new chat');
    }
}

const getErrorKind = (error: Error) => {
    try {
        const parsedError = JSON.parse(error.message);
        return parsedError?.kind;
    } catch (e) {
        return 'UnknownError';
    }
};
