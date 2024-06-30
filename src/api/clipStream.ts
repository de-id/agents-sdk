import {
    Auth,
    ClipStreamOptions,
    ICreateStreamRequestResponse,
    IceCandidate,
    RtcApi,
    SendClipStreamPayload,
    SendStreamPayloadResponse,
    Status,
} from '$/types/index';
import { createClient } from './getClient';

export function createApi(
    auth: Auth,
    host: string,
    agentId: string,
    onError?: (error: Error, errorData: object) => void
): RtcApi {
    const client = createClient(auth, `${host}/agents/${agentId}`, onError);

    return {
        createStream(options: ClipStreamOptions) {
            return client.post<ICreateStreamRequestResponse>('/streams', {
                compatibility_mode: options.compatibility_mode,
                stream_warmup: options.stream_warmup,
                session_timeout: options.session_timeout,
            });
        },
        startConnection(streamId: string, answer: RTCSessionDescriptionInit, sessionId?: string) {
            return client.post<Status>(`/streams/${streamId}/sdp`, {
                session_id: sessionId,
                answer,
            });
        },
        addIceCandidate(streamId: string, candidate: IceCandidate, sessionId: string) {
            return client.post<Status>(`/streams/${streamId}/ice`, {
                session_id: sessionId,
                ...candidate,
            });
        },
        sendStreamRequest(streamId: string, sessionId: string, payload: SendClipStreamPayload) {
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
