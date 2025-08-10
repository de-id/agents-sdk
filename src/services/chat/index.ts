import { PLAYGROUND_HEADER } from '$/config/consts';
import type { AgentsAPI, Chat } from '$/types';
import { ChatMode } from '$/types';
import { isChatModeWithoutChat } from '$/utils/chat';
import { Analytics } from '../analytics/mixpanel';

export function getRequestHeaders(chatMode?: ChatMode): Record<string, Record<string, string>> {
    return chatMode === ChatMode.Playground ? { headers: { [PLAYGROUND_HEADER]: 'true' } } : {};
}

export async function createChat(
    agentId: string,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chatMode?: ChatMode,
    persist = false,
    chat?: Chat
) {
    const startTime = performance.now();
    console.log(`[PERF] createChat started at ${new Date().toISOString()}`);

    try {
        if (!chat && !isChatModeWithoutChat(chatMode)) {
            const chatCreateStartTime = performance.now();
            chat = await agentsApi.newChat(agentId, { persist }, getRequestHeaders(chatMode));
            const chatCreateEndTime = performance.now();
            console.log(`[PERF] Chat creation API call: ${(chatCreateEndTime - chatCreateStartTime).toFixed(2)}ms`);

            analytics.track('agent-chat', {
                event: 'created',
                chatId: chat.id,
                mode: chatMode,
            });
        }

        const totalTime = performance.now() - startTime;
        console.log(`[PERF] createChat completed in ${totalTime.toFixed(2)}ms`);

        return { chat, chatMode: chat?.chat_mode ?? chatMode };
    } catch (error: any) {
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
}
