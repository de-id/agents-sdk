/**
 * The session identifier carried by every request and response of a Talks (V2) or Clips (V3)
 * stream.
 *
 * The SDK holds on to the id created with the stream and sends it back on each subsequent
 * streaming request, which is what keeps the requests on the same stream. Applications rarely need
 * it; it is part of the public surface because {@link SendStreamPayloadResponse} extends it.
 *
 * @category Streaming Options
 */
export interface StickyRequest {
    /**
     * Session identifier information, which should be returned in the body of all streaming
     * requests.
     */
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
 * STUN/TURN server credentials returned by the D-ID API for establishing the WebRTC connection.
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
 * The outcome the Agents API reported for a streaming request.
 *
 * The base of {@link SendStreamPayloadResponse}, and the shape returned by the streaming requests
 * that have nothing else to report.
 *
 * @category Streaming Options
 */
export interface Status {
    /** How the request ended, as reported by the server — for example `success`. */
    status: string;
}

/**
 * What {@link AgentManager.speak | speak()} resolves with: the video the agent is about to stream.
 *
 * The fields come from the Talks (V2) and Clips (V3) API, which generates a discrete video while
 * answering the request. Where no such video exists the call still resolves, with the same stub —
 * `status` `'success'`, `duration` `0` and an empty `video_id`: on Expressive (V4) agents, whose
 * speech is streamed over the data channel rather than rendered as a separate video, and in a
 * text-only chat mode ({@link ChatMode.TextOnly}, {@link ChatMode.Playground} or
 * {@link ChatMode.Maintenance}), which produces no video at all.
 *
 * @category Streaming Options
 */
export interface SendStreamPayloadResponse {
    status: string;
    session_id?: string;
    /**
     * Duration of the generated video as reported by the streams API for Talks (V2) and Clips (V3)
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
    video_id: string;
}
