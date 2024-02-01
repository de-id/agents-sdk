import { Auth, RatingEntity, RatingPayload } from '$/index';
import { createClient } from './getClient';


export function createRatingssApi(auth: Auth, host = 'https://api.d-id.com') {
    const client = createClient(auth, `${host}/chats/ratings`);

    return {
        create(payload: RatingPayload, options?: RequestInit) {
            return client.post<RatingEntity>(`/`, payload, options);
        },
        getByKnowledge(knowledgeId?: string, options?: RequestInit) {
            return client.get<RatingEntity[]>(`/${knowledgeId}`, options).then(ratings => ratings ?? []);
        },
        update(id: string, payload: Partial<RatingPayload>, options?: RequestInit) {
            return client.patch<RatingEntity>(`/${id}`, payload, options);
        },
        delete(id: string, options?: RequestInit) {
            return client.delete<RatingEntity>(`/${id}`, options);
        },
    };
}
