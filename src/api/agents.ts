import { Agent, AgentPayload, Auth, Chat, ChatPayload, ChatResponse, RatingEntity, RatingPayload } from '$/types/index';
import { didApiUrl } from '../environment';
import { createClient } from './getClient';

export function createAgentsApi(
    auth: Auth,
    host: string = didApiUrl,
    onError?: (error: Error, errorData: object) => void
) {
    const client = createClient(auth, `${host}/agents`, onError);

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
        newChat(agentId: string, payload: { persist: boolean }, options?: RequestInit) {
            return client.post<Chat>(`/${agentId}/chat`, payload, options);
        },
        chat(agentId: string, chatId: string, payload: ChatPayload, options?: RequestInit) {
            return client.post<ChatResponse>(`/${agentId}/chat/${chatId}`, payload, options);
        },
        createRating(agentId: string, chatId: string, payload: RatingPayload, options?: RequestInit) {
            return client.post<RatingEntity>(`/${agentId}/chat/${chatId}/ratings`, payload, options);
        },
        updateRating(
            agentId: string,
            chatId: string,
            ratingId: string,
            payload: Partial<RatingPayload>,
            options?: RequestInit
        ) {
            return client.patch<RatingEntity>(`/${agentId}/chat/${chatId}/ratings/${ratingId}`, payload, options);
        },
        deleteRating(agentId: string, chatId: string, ratingId: string, options?: RequestInit) {
            return client.delete<RatingEntity>(`/${agentId}/chat/${chatId}/ratings/${ratingId}`, options);
        },
    };
}
