/**
 * Transport used to establish a session created via the v2 sessions API.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export enum TransportProvider {
    Livekit = 'livekit',
}

/**
 * Wire request body for creating a session via the v2 sessions API.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface CreateSessionV2Options {
    transport: {
        provider: TransportProvider.Livekit;
    };
    chat_persist?: boolean;
    verbose?: boolean;
}

/**
 * Wire response of the v2 sessions API's session-creation request.
 * @internal Wire type of the streaming transport; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface CreateSessionV2Response {
    id: string;
    session_url: string;
    session_token: string;
    interrupt_enabled: boolean;
}
