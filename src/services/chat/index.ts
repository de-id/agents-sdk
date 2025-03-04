import { PLAYGROUND_HEADER } from '$/consts';
import { Agent, AgentsAPI, Chat, ChatMode } from '$/types';
import { Analytics } from '../analytics/mixpanel';

export function getRequestHeaders(chatMode?: ChatMode): Record<string, Record<string, string>> {
    return chatMode === ChatMode.Playground ? { headers: { [PLAYGROUND_HEADER]: 'true' } } : {};
}

export function handleError(error: any): never {
    try {
        const parsedError = JSON.parse(error.message);

        if (parsedError?.kind === 'InsufficientCreditsError') {
            throw new Error('InsufficientCreditsError');
        }
    } catch (e) {
        console.error('Error parsing the error message:', e);
    }

    throw new Error('Cannot create new chat');
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
        if (!chat && chatMode !== ChatMode.DirectPlayback) {
            chat = await agentsApi.newChat(agent.id, { persist }, getRequestHeaders(chatMode));

            analytics.track('agent-chat', {
                event: 'created',
                chat_id: chat.id,
                agent_id: agent.id,
                mode: chatMode,
            });
        }

        return { chat, chatMode: chat?.chat_mode ?? chatMode };
    } catch (error: any) {
        handleError(error);
    }
}
