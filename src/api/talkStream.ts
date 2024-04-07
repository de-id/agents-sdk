import {
    Auth,
    ICreateStreamRequestResponse,
    IceCandidate,
    RtcApi,
    SendStreamPayloadResponse,
    SendTalkStreamPayload,
    Status,
    TalkStreamOptions,
} from '$/types/index'
import { createClient } from './getClient';

export function createApi(auth: Auth, host: string): RtcApi {
    const client = createClient(auth, host);

    return {
        createStream(streamOptions: TalkStreamOptions, options?: RequestInit) {
            return client.post<ICreateStreamRequestResponse>(
                '/talks/streams',
                {
                    source_url: streamOptions.source_url,
                    driver_url: streamOptions.driver_url,
                    face: streamOptions.face,
                    config: streamOptions.config,
                    stream_warmup: streamOptions.stream_warmup,
                },
                options
            );
        },
        startConnection(
            streamId: string,
            answer: RTCSessionDescriptionInit,
            sessionId?: string,
            options?: RequestInit
        ) {
            return client.post<Status>(`/talks/streams/${streamId}/sdp`, { session_id: sessionId, answer }, options);
        },
        addIceCandidate(streamId: string, candidate: IceCandidate, sessionId: string, options?: RequestInit) {
            return client.post<Status>(
                `/talks/streams/${streamId}/ice`,
                { session_id: sessionId, ...candidate },
                options
            );
        },
        sendStreamRequest(streamId: string, sessionId: string, payload: SendTalkStreamPayload, options?: RequestInit) {
            return client.post<SendStreamPayloadResponse>(
                `/talks/streams/${streamId}`,
                {
                    session_id: sessionId,
                    ...payload,
                },
                options
            );
        },
        close(streamId: string, sessionId: string, options?: RequestInit) {
            return client.delete<Status>(`/talks/streams/${streamId}`, { session_id: sessionId }, options);
        },
    };
}
