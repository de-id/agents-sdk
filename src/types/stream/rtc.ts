/**
 * Carrier of the `session_id` that keeps successive streaming requests on the same server session.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 */
export interface StickyRequest {
    session_id?: string;
}

interface Jsep {
    /**
     * The type of the message - should normally be `answer` when replying to the offer
     */
    type: 'offer' | 'answer';

    /**
     * Describe the media communication sessions to accept the session the is being negotiated
     */
    sdp: string;
}

/**
 * STUN/TURN server credentials returned by the Agents API for establishing the WebRTC connection.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 */
export interface IceServer {
    /**
     * URL of the server - can be multiple addresses
     */
    urls: string[] | string;
    /**
     * Username for authentication
     */
    username?: string;
    /**
     * Credintials for secure connection to the server
     */
    credential?: string;
}

/**
 * Response of `POST /agents/{id}/streams`: the SDP offer and ICE servers for the WebRTC handshake.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 */
export interface ICreateStreamRequestResponse extends StickyRequest {
    id: string;
    jsep: Jsep;
    offer: any;
    ice_servers: IceServer[];
    fluent?: boolean;
    interrupt_enabled?: boolean;
}

/**
 * A single ICE candidate exchanged during the WebRTC connection handshake.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 */
export interface IceCandidate {
    /**
     * A string representing the transport address for the candidate that can be used for connectivity checks.
     * The format of this address is a candidate-attribute as defined in RFC 5245. This string is empty ("") if the
     * RTCIceCandidate is an "end of candidates" indicator.
     */
    candidate: string | null;

    /**
     * A string specifying the candidate's media stream identification tag which uniquely identifies the media stream
     * within the component with which the candidate is associated, or null if no such association exists.
     */
    sdpMid?: string;

    /**
     * If not null, sdpMLineIndex indicates the zero-based index number of the media description (as defined in RFC
     * 4566) in the SDP with which the candidate is associated.
     */
    sdpMLineIndex?: number;
}

/**
 * Bare `{ status }` envelope returned by the streaming endpoints that report only success or failure.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 */
export interface Status {
    status: string;
}

/**
 * What {@link AgentManager.speak | speak()} resolves with: the video the agent is about to stream.
 *
 * The fields come from the Talks (V2) and Clips (V3) API, which generates a discrete video while
 * answering the request. Where no such video exists the call still resolves, with the same stub —
 * `status` `'success'`, `duration` `0` and an empty `videoId`: on Expressive (V4) agents, whose
 * speech is streamed over the data channel rather than rendered as a separate video, and in a
 * text-only chat mode ({@link ChatMode.TextOnly}, {@link ChatMode.Playground} or
 * {@link ChatMode.Maintenance}), which produces no video at all.
 *
 * @category Speak & Scripts
 */
export interface SpeakResponse {
    /**
     * What the server said about the request it accepted.
     *
     * Not a fixed set: the Agents API declares it as an open string and Talks (V2) and Clips (V3)
     * agents pass its value through, so treat an unrecognised value as "accepted" rather than
     * matching on it — a rejected request comes back as an {@link HttpError}, not as a status
     * here. It is `'success'` on the stub the SDK returns where no discrete video is produced: on
     * Expressive (V4) agents and in a text-only chat mode.
     */
    status: string;
    /**
     * Id of the session this call was made on; the SDK sends it back on later streaming requests.
     */
    sessionId?: string;
    /**
     * Duration of the generated video as reported by the Agents API for Talks (V2) and Clips (V3)
     * agents. `0` when the call produced no discrete video — on Expressive (V4) agents, and in a
     * text-only chat mode.
     */
    duration: number;
    /**
     * Id of the generated video.
     *
     * Use it to correlate this call with the video the agent then plays, which
     * {@link AgentManagerCallbacks.onVideoStateChange | onVideoStateChange} reports the start and
     * end of, and which {@link AgentManager.interrupt | interrupt()} cancels. Empty when the call
     * produced no discrete video — on Expressive (V4) agents, and in a text-only chat mode.
     */
    videoId: string;
}

/**
 * What the Agents API answers a speak request with, converted to {@link SpeakResponse} before it
 * reaches the application.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 */
export interface SpeakWireResponse {
    status: string;
    session_id?: string;
    duration: number;
    video_id: string;
}
