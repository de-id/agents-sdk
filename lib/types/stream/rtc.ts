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

export interface ICreateStreamRequestResponse extends StickyRequest {
    id: string;
    jsep: Jsep;
    offer: any;
    ice_servers: IceServer[];
}

export interface IceCandidate {
    /**
     * A string representing the transport address for the candidate that can be used for connectivity checks.
     * The format of this address is a candidate-attribute as defined in RFC 5245. This string is empty ("") if the
     * RTCIceCandidate is an "end of candidates" indicator.
     */
    candidate: string;

    /**
     * A string specifying the candidate's media stream identification tag which uniquely identifies the media stream
     * within the component with which the candidate is associated, or null if no such association exists.
     */
    sdpMid: string;

    /**
     * If not null, sdpMLineIndex indicates the zero-based index number of the media description (as defined in RFC
     * 4566) in the SDP with which the candidate is associated.
     */
    sdpMLineIndex: number;
}

export interface Status {
    status: string;
}

export interface SendStreamPayloadResponse extends Status, StickyRequest {
    duration: number;
}
