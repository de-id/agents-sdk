import {
    Agent,
    Auth,
    Chat,
    ChatPayload,
    ChatResponse,
    Rating,
    RatingPayload,
    SttTokenResponse,
    SubmitFeedbackResponse,
} from '@sdk/types/index';
import { didApiUrl } from '../config/environment';
import { RequestOptions, createClient } from './apiClient';

export function createAgentsApi(
    auth: Auth,
    host: string = didApiUrl,
    onError?: (error: Error, errorData: Record<string, unknown>) => void,
    externalId?: string
) {
    const client = createClient(auth, `${host}/agents`, onError, externalId);

    return {
        getRuntimeById(id: string, options?: RequestOptions) {
            return client.get<Agent>(`/${id}/runtime`, options);
        },
        newChat(agentId: string, payload: { persist: boolean }, options?: RequestOptions) {
            return client.post<Chat>(`/${agentId}/chat`, payload, options);
        },
        chat(agentId: string, chatId: string, payload: ChatPayload, options?: RequestOptions) {
            return client.post<ChatResponse>(`/${agentId}/chat/${chatId}`, payload, options);
        },
        createRating(agentId: string, chatId: string, payload: RatingPayload, options?: RequestOptions) {
            return client.post<Rating>(`/${agentId}/chat/${chatId}/ratings`, payload, options);
        },
        updateRating(
            agentId: string,
            chatId: string,
            ratingId: string,
            payload: Partial<RatingPayload>,
            options?: RequestOptions
        ) {
            return client.patch<Rating>(`/${agentId}/chat/${chatId}/ratings/${ratingId}`, payload, options);
        },
        deleteRating(agentId: string, chatId: string, ratingId: string, options?: RequestOptions) {
            return client.delete<Rating>(`/${agentId}/chat/${chatId}/ratings/${ratingId}`, options);
        },
        submitFeedback(
            agentId: string,
            chatId: string,
            payload: { rating: number; answer?: string },
            options?: RequestOptions
        ) {
            return client.post<SubmitFeedbackResponse>(`/${agentId}/chat/${chatId}/feedback`, payload, options);
        },
        getSttToken(agentId: string, options?: RequestOptions) {
            return client.get<SttTokenResponse>(`/${agentId}/stt-token`, options);
        },
    };
}
