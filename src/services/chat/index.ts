import { PLAYGROUND_HEADER } from '@sdk/config/consts';
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
    // A chat handed in by the caller is carried over from an earlier connect and still holds the
    // mode it was created in. Only a chat created here says anything about the mode this session
    // is in, so only that one is allowed to answer with one.
    const carriedOver = !!chat;

    if (!chat && !isChatModeWithoutChat(chatMode)) {
        chat = await agentsApi.newChat(agent.id, { persist }, getRequestHeaders(chatMode));

        analytics.track('agent-chat', {
            event: 'created',
            chatId: chat.id,
            mode: chatMode,
        });
    }

    return { chat, chatMode: carriedOver ? chatMode : (chat?.chat_mode ?? chatMode) };
}
