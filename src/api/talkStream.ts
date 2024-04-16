import {
    Auth,
    ICreateStreamRequestResponse,
    IceCandidate,
    RtcApi,
    SendStreamPayloadResponse,
    SendTalkStreamPayload,
    Status,
    TalkStreamOptions,
    VideoType,
} from '$/types/index';
import { createClient } from './getClient';

export function createApi(auth: Auth, host: string, agentId: string): RtcApi {
    const client = createClient(auth, `${host}/agents/${agentId}`);

    return {
        createStream(streamOptions: TalkStreamOptions, options?: RequestInit) {
            return client.post<ICreateStreamRequestResponse>(
                '/streams',
                {
                    source_url: streamOptions.source_url,
                    driver_url: streamOptions.driver_url,
                    face: streamOptions.face,
                    config: streamOptions.config,
                    stream_warmup: streamOptions.stream_warmup,
                    type: VideoType.Talk,
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
                { session_id: sessionId, answer, type: VideoType.Talk },
                options
            );
        },
        addIceCandidate(streamId: string, candidate: IceCandidate, sessionId: string, options?: RequestInit) {
            return client.post<Status>(
                `/streams/${streamId}/ice`,
                { session_id: sessionId, ...candidate, type: VideoType.Talk },
                options
            );
        },
        sendStreamRequest(streamId: string, sessionId: string, payload: SendTalkStreamPayload, options?: RequestInit) {
            return client.post<SendStreamPayloadResponse>(
                `/streams/${streamId}`,
                {
                    session_id: sessionId,
                    ...payload,
                    type: VideoType.Talk,
                },
                options
            );
        },
        close(streamId: string, sessionId: string, options?: RequestInit) {
            return client.delete<Status>(
                `/streams/${streamId}`,
                { session_id: sessionId, type: VideoType.Talk },
                options
            );
        },
    };
}
