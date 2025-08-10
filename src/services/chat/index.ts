import { PLAYGROUND_HEADER } from '$/config/consts';
import type { AgentsAPI, Chat } from '$/types';
import { ChatMode } from '$/types';
import { isChatModeWithoutChat } from '$/utils/chat';
import { Analytics } from '../analytics/mixpanel';

export function getRequestHeaders(chatMode?: ChatMode): Record<string, Record<string, string>> {
    return chatMode === ChatMode.Playground ? { headers: { [PLAYGROUND_HEADER]: 'true' } } : {};
}

export interface CreateChatResult {
    chat?: Chat;
    chatMode?: ChatMode;
}

export async function createChat(
    agentId: string,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chatMode?: ChatMode,
    persist = false,
    chat?: Chat
): Promise<CreateChatResult> {
    try {
        if (!chat && !isChatModeWithoutChat(chatMode)) {
            chat = await agentsApi.newChat(agentId, { persist }, getRequestHeaders(chatMode));
        }

        if (chat) {
            analytics.track('agent-chat', { event: 'created', chat_id: chat.id });
        }

        return { chat, chatMode };
    } catch (error: any) {
        analytics.track('agent-chat', { event: 'creation-failed', error: error.message });
        throw error;
    }
}
