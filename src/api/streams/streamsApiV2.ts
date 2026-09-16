import { Auth, CreateSessionV2Options, CreateSessionV2Response, ErrorContext } from '@sdk/types';
import { createClient } from '../apiClient';

export function createStreamApiV2(
    auth: Auth,
    host: string,
    agentId: string,
    onError?: (error: Error, errorData: ErrorContext) => void
) {
    const client = createClient(auth, `${host}/v2/agents/${agentId}`, onError);

    return {
        async createStream(options: CreateSessionV2Options) {
            return client.post<CreateSessionV2Response>('/sessions', options);
        },
    };
}
