export enum TransportProvider {
    Livekit = 'livekit',
}

export interface CreateSessionV2Options {
    transport: {
        provider: TransportProvider.Livekit;
        credentials?: {
            /** LiveKit server WebSocket URL */
            url: string;
            /** LiveKit API key */
            api_key: string;
            /** LiveKit API secret */
            api_secret: string;
        };
    };
    chat_persist?: boolean;
}

export interface CreateSessionV2Response {
    id: string;
    session_url: string;
    session_token: string;
    interrupt_enabled: boolean;
}
