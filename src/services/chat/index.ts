import { PLAYGROUND_HEADER } from '@sdk/config/consts';
import type { AgentsAPI, Chat, RuntimeAgent } from '@sdk/types';
import { ChatMode } from '@sdk/types';
import { isChatModeWithoutChat } from '@sdk/utils/chat';
import { Analytics } from '../analytics/mixpanel';

export function getRequestHeaders(chatMode?: ChatMode): { headers?: Record<string, string> } {
    return chatMode === ChatMode.Playground ? { headers: { [PLAYGROUND_HEADER]: 'true' } } : {};
}

export async function createChat(
    agent: RuntimeAgent,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chatMode?: ChatMode,
    persist = false,
    chat?: Chat
) {
    if (!chat && !isChatModeWithoutChat(chatMode)) {
        chat = await agentsApi.newChat(agent.id, { persist }, getRequestHeaders(chatMode));

        analytics.track('agent-chat', {
            event: 'created',
            chatId: chat.id,
            mode: chatMode,
        });
    }

    return { chat, chatMode: chat?.chat_mode ?? chatMode };
}
