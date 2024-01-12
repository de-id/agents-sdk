import { Agent, AgentPayload, Auth, Chat, ChatPayload, ChatResponse } from '$/types/index';
import { createClient } from './getClient';

export function createAgentsApi(auth: Auth, host = 'https://api.d-id.com') {
    const client = createClient(auth, `${host}/agents`);

    return {
        create(payload: AgentPayload, options?: RequestInit) {
            return client.post<Agent>(`/`, payload, options);
        },
        getAgents(tag?: string, options?: RequestInit) {
            return client.get<Agent[]>(`/${tag ? `?tag=${tag}` : ''}`, options).then(agents => agents ?? []);
        },
        getById(id: string, options?: RequestInit) {
            return client.get<Agent>(`/${id}`, options);
        },
        delete(id: string, options?: RequestInit) {
            return client.delete(`/${id}`, undefined, options);
        },
        update(id: string, payload: AgentPayload, options?: RequestInit) {
            return client.patch<Agent>(`/${id}`, payload, options);
        },
        newChat(agentId: string, options?: RequestInit) {
            return client.post<Chat>(`/${agentId}/chat`, undefined, options);
        },
        chat(agentId: string, chatId: string, payload: ChatPayload, options?: RequestInit) {
            return client.post<ChatResponse | string>(`/${agentId}/chat/${chatId}`, payload, options);
        },
    };
}
