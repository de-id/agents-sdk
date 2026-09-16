import {
    Auth,
    CreateStreamOptions,
    ErrorContext,
    ICreateStreamRequestResponse,
    IceCandidate,
    RtcApi,
    SendClipStreamPayload,
    SendTalkStreamPayload,
    SpeakResponse,
    SpeakWireResponse,
    Status,
} from '@sdk/types/index';
import { createClient } from '../apiClient';

/**
 * The Agents API answers a speak request in snake_case; {@link SpeakResponse} is camelCase.
 * This is the single place the two shapes meet.
 */
function toSpeakResponse(wire: SpeakWireResponse): SpeakResponse {
    return {
        status: wire.status,
        sessionId: wire.session_id,
        duration: wire.duration,
        videoId: wire.video_id,
    };
}

export function createStreamApi(
    auth: Auth,
    host: string,
    agentId: string,
    onError?: (error: Error, errorData: ErrorContext) => void
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
        async sendStreamRequest(
            streamId: string,
            sessionId: string,
            payload: SendClipStreamPayload | SendTalkStreamPayload
        ) {
            const wire = await client.post<SpeakWireResponse>(`/streams/${streamId}`, {
                session_id: sessionId,
                ...payload,
            });

            return toSpeakResponse(wire);
        },
        close(streamId: string, sessionId: string) {
            return client.delete<Status>(`/streams/${streamId}`, { session_id: sessionId });
        },
    };
}
