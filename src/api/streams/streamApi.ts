import {
    Auth,
    CreateStreamOptions,
    ICreateStreamRequestResponse,
    IceCandidate,
    RtcApi,
    SendClipStreamPayload,
    SendStreamPayloadResponse,
    SendTalkStreamPayload,
    Status,
} from '@sdk/types/index';
import { createClient } from '../apiClient';

export function createStreamApi(
    auth: Auth,
    host: string,
    agentId: string,
    onError?: (error: Error, errorData: object) => void
): RtcApi {
    const client = createClient(auth, `${host}/agents/${agentId}`, onError);

    return {
        createStream(options: CreateStreamOptions, signal?: AbortSignal) {
            return client.post<ICreateStreamRequestResponse>('/streams', options, { signal });
        },
        startConnection(streamId: string, answer: RTCSessionDescriptionInit, sessionId?: string, signal?: AbortSignal) {
            return client.post<Status>(
                `/streams/${streamId}/sdp`,
                {
                    session_id: sessionId,
                    answer,
                },
                { signal }
            );
        },
        addIceCandidate(streamId: string, candidate: IceCandidate, sessionId: string, signal?: AbortSignal) {
            return client.post<Status>(
                `/streams/${streamId}/ice`,
                {
                    session_id: sessionId,
                    ...candidate,
                },
                { signal }
            );
        },
        sendStreamRequest(streamId: string, sessionId: string, payload: SendClipStreamPayload | SendTalkStreamPayload) {
            return client.post<SendStreamPayloadResponse>(`/streams/${streamId}`, {
                session_id: sessionId,
                ...payload,
            });
        },
        close(streamId: string, sessionId: string) {
            return client.delete<Status>(`/streams/${streamId}`, { session_id: sessionId });
        },
    };
}
