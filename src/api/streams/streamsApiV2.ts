import { Auth, CreateSessionV2Options, CreateSessionV2Response, ErrorReporter } from '@sdk/types';
import { createClient } from '../apiClient';

export function createStreamApiV2(auth: Auth, host: string, agentId: string, onError?: ErrorReporter) {
    const client = createClient(auth, `${host}/v2/agents/${agentId}`, onError);

    return {
        async createStream(options: CreateSessionV2Options) {
            return client.post<CreateSessionV2Response>('/sessions', options);
        },
    };
}
