import {
    Agent,
    AgentPayload,
    Auth,
    Chat,
    ChatPayload,
    ChatResponse,
    RatingEntity,
    RatingPayload,
    STTTokenResponse,
} from '$/types/index';
import { didApiUrl } from '../config/environment';
import { RequestOptions, createClient } from './apiClient';

export function createAgentsApi(
    auth: Auth,
    host: string = didApiUrl,
    onError?: (error: Error, errorData: object) => void
) {
    const client = createClient(auth, `${host}/agents`, onError);

    return {
        create(payload: AgentPayload, options?: RequestOptions) {
            return client.post<Agent>(`/`, payload, options);
        },
        getAgents(tag?: string, options?: RequestOptions) {
            return client.get<Agent[]>(`/${tag ? `?tag=${tag}` : ''}`, options).then(agents => agents ?? []);
        },
        getById(id: string, options?: RequestOptions) {
            return client.get<Agent>(`/${id}`, options);
        },
        delete(id: string, options?: RequestOptions) {
            return client.delete(`/${id}`, undefined, options);
        },
        update(id: string, payload: AgentPayload, options?: RequestOptions) {
            return client.patch<Agent>(`/${id}`, payload, options);
        },
        newChat(agentId: string, payload: { persist: boolean }, options?: RequestOptions) {
            return client.post<Chat>(`/${agentId}/chat`, payload, options);
        },
        chat(agentId: string, chatId: string, payload: ChatPayload, options?: RequestOptions) {
            return client.post<ChatResponse>(`/${agentId}/chat/${chatId}`, payload, options);
        },
        createRating(agentId: string, chatId: string, payload: RatingPayload, options?: RequestOptions) {
            return client.post<RatingEntity>(`/${agentId}/chat/${chatId}/ratings`, payload, options);
        },
        updateRating(
            agentId: string,
            chatId: string,
            ratingId: string,
            payload: Partial<RatingPayload>,
            options?: RequestOptions
        ) {
            return client.patch<RatingEntity>(`/${agentId}/chat/${chatId}/ratings/${ratingId}`, payload, options);
        },
        deleteRating(agentId: string, chatId: string, ratingId: string, options?: RequestOptions) {
            return client.delete<RatingEntity>(`/${agentId}/chat/${chatId}/ratings/${ratingId}`, options);
        },
        getSTTToken(agentId: string, options?: RequestOptions) {
            return client.get<STTTokenResponse>(`/${agentId}/stt-token`, options);
        },
    };
}
