import {
    Auth,
    ClipStreamOptions,
    ICreateStreamRequestResponse,
    IceCandidate,
    RtcApi,
    SendClipStreamPayload,
    SendStreamPayloadResponse,
    Status,
    VideoType,
} from '$/types/index';
import { createClient } from './getClient';

export function createApi(auth: Auth, host: string, agentId: string): RtcApi {
    const client = createClient(auth, `${host}/agents/${agentId}`);

    return {
        createStream(options: ClipStreamOptions) {
            return client.post<ICreateStreamRequestResponse>('/streams', {
                driver_id: options.driver_id,
                presenter_id: options.presenter_id,
                compatibility_mode: options.compatibility_mode,
                stream_warmup: options.stream_warmup,
                type: VideoType.Clip,
            });
        },
        startConnection(streamId: string, answer: RTCSessionDescriptionInit, sessionId?: string) {
            return client.post<Status>(`/streams/${streamId}/sdp`, {
                session_id: sessionId,
                answer,
                type: VideoType.Clip,
            });
        },
        addIceCandidate(streamId: string, candidate: IceCandidate, sessionId: string) {
            return client.post<Status>(`/streams/${streamId}/ice`, {
                session_id: sessionId,
                ...candidate,
                type: VideoType.Clip,
            });
        },
        sendStreamRequest(streamId: string, sessionId: string, payload: SendClipStreamPayload) {
            return client.post<SendStreamPayloadResponse>(`/streams/${streamId}`, {
                session_id: sessionId,
                ...payload,
                type: VideoType.Clip,
            });
        },
        close(streamId: string, sessionId: string) {
            return client.delete<Status>(`/streams/${streamId}`, { session_id: sessionId, type: VideoType.Clip });
        },
    };
}
