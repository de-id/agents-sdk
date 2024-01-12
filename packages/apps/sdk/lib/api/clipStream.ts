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

export function createApi(auth: Auth, host: string): RtcApi {
    const client = createClient(auth, host);

    return {
        createStream(options: ClipStreamOptions) {
            return client.post<ICreateStreamRequestResponse>('/clips/streams', {
                driver_id: options.driver_id,
                presenter_id: options.presenter_id,
                compatibility_mode: options.compatibility_mode,
            });
        },
        startConnection(streamId: string, answer: RTCSessionDescriptionInit, sessionId?: string) {
            return client.post<Status>(`/clips/streams/${streamId}/sdp`, { session_id: sessionId, answer });
        },
        addIceCandidate(streamId: string, candidate: IceCandidate, sessionId: string) {
            return client.post<Status>(`/clips/streams/${streamId}/ice`, { session_id: sessionId, ...candidate });
        },
        sendStreamRequest(streamId: string, sessionId: string, payload: SendClipStreamPayload) {
            return client.post<SendStreamPayloadResponse>(`/clips/streams/${streamId}`, {
                session_id: sessionId,
                ...payload,
            });
        },
        close(streamId: string, sessionId: string) {
            return client.delete<Status>(`/clips/streams/${streamId}`, { session_id: sessionId });
        },
    };
}
