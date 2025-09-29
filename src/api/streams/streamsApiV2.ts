import { Auth, CreateStreamV2Options, CreateStreamV2Response } from '$/types';
import { createClient } from '../apiClient';

export function createStreamApiV2(
    auth: Auth,
    host: string,
    agentId: string,
    onError?: (error: Error, errorData: object) => void
) {
    const client = createClient(auth, `${host}/v2/agents/${agentId}`, onError);

    return {
        async createStream(options: CreateStreamV2Options) {
            return client.post<CreateStreamV2Response>('/streams', options);
        },
    };
}
