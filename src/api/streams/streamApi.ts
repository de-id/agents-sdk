import {
    Auth,
    CreateStreamOptions,
    ErrorReporter,
    ICreateStreamRequestResponse,
    IceCandidate,
    RtcApi,
    SendClipStreamPayload,
    SendTalkStreamPayload,
    SpeakWireResponse,
    Status,
} from '@sdk/types/index';
import { createClient } from '../apiClient';

export function createStreamApi(auth: Auth, host: string, agentId: string, onError?: ErrorReporter): RtcApi {
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
        async sendStreamRequest(
            streamId: string,
            sessionId: string,
            payload: SendClipStreamPayload | SendTalkStreamPayload
        ) {
            const wire = await client.post<SpeakWireResponse>(`/streams/${streamId}`, {
                session_id: sessionId,
                ...payload,
            });

            // The Agents API answers in snake_case; `SpeakResponse` is camelCase.
            return {
                status: wire.status,
                sessionId: wire.session_id,
                duration: wire.duration,
                videoId: wire.video_id,
            };
        },
        close(streamId: string, sessionId: string) {
            // Teardown is best-effort, so it is kept out of `onError`: by the time this runs the
            // session is often already gone server-side - expired while idle, or reaped when the
            // peer connection closed just before - and the `missing or invalid session_id` that
            // comes back is nothing the application can act on. `disconnect()` logs it instead.
            return client.delete<Status>(`/streams/${streamId}`, { session_id: sessionId }, { skipErrorHandler: true });
        },
    };
}
