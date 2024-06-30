import {
    Auth,
    ICreateStreamRequestResponse,
    IceCandidate,
    RtcApi,
    SendStreamPayloadResponse,
    SendTalkStreamPayload,
    Status,
    TalkStreamOptions,
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
        createStream(streamOptions: TalkStreamOptions, options?: RequestInit) {
            return client.post<ICreateStreamRequestResponse>(
                '/streams',
                {
                    driver_url: streamOptions.driver_url,
                    face: streamOptions.face,
                    config: streamOptions.config,
                    compatibility_mode: streamOptions.compatibility_mode,
                    stream_warmup: streamOptions.stream_warmup,
                    output_resolution: streamOptions.output_resolution,
                    session_timeout: streamOptions.session_timeout,
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
            return client.post<Status>(
                `/streams/${streamId}/sdp`,
                { session_id: sessionId, answer },
                options
            );
        },
        addIceCandidate(streamId: string, candidate: IceCandidate, sessionId: string, options?: RequestInit) {
            return client.post<Status>(
                `/streams/${streamId}/ice`,
                { session_id: sessionId, ...candidate },
                options
            );
        },
        sendStreamRequest(streamId: string, sessionId: string, payload: SendTalkStreamPayload, options?: RequestInit) {
            return client.post<SendStreamPayloadResponse>(
                `/streams/${streamId}`,
                {
                    session_id: sessionId,
                    ...payload,
                },
                options
            );
        },
        close(streamId: string, sessionId: string, options?: RequestInit) {
            return client.delete<Status>(
                `/streams/${streamId}`,
                { session_id: sessionId },
                options
            );
        },
    };
}
