/**
 * Carrier of the `session_id` that keeps successive streaming requests on the same server session.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 */
export interface StickyRequest {
    /**
     * session identifier information, should be returned in the body of all streaming requests
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
 * Bare `{ status }` envelope returned by the streaming endpoints that report only success or failure.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 */
export interface Status {
    status: string;
}

export interface SendStreamPayloadResponse {
    status: string;
    /**
     * Identifier of the session the video was queued on; the SDK sends it back on the streaming
     * requests that follow.
     */
    session_id?: string;
    duration: number;
    video_id: string;
}
