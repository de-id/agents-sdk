import { PLAYGROUND_HEADER } from '$/consts';
import { StreamingManager } from '$/services/streaming-manager';
import { ChatModeDowngraded } from '$/errors/chat-mode-downgraded';
import { Agent, AgentManagerOptions, AgentsAPI, Chat, ChatMode, CreateStreamOptions } from '$/types';
import { createChat } from '../chat';
import { Analytics } from '../mixpanel';
import { connectToManager } from './connect-to-manager';

export function getRequestHeaders(chatMode?: ChatMode): Record<string, Record<string, string>> {
    return chatMode === ChatMode.Playground ? { headers: { [PLAYGROUND_HEADER]: 'true' } } : {};
}

export async function initializeStreamAndChat(
    agent: Agent,
    options: AgentManagerOptions,
    agentsApi: AgentsAPI,
    analytics: Analytics,
    chat?: Chat,
    greeting?: string
): Promise<{ chat?: Chat; streamingManager?: StreamingManager<CreateStreamOptions> }> {
    const { chat: newChat, chatMode } = await createChat(
        agent,
        agentsApi,
        analytics,
        options.mode,
        options.persistentChat,
        chat
    );

    if (chatMode && chatMode !== options.mode) {
        options.mode = chatMode;
        options.callbacks.onModeChange?.(chatMode);

        if (chatMode === ChatMode.TextOnly) {
            options.callbacks.onError?.(new ChatModeDowngraded(chatMode));

            return { chat: newChat };
        }
    }

    const streamingManager = await connectToManager(agent, options, analytics, greeting);

    return { chat: newChat, streamingManager };
}
