export enum TransportProvider {
    Livekit = 'livekit',
}

export interface CreateSessionV2Options {
    transport_provider: TransportProvider.Livekit;
    chat_persist?: boolean;
}

export interface CreateSessionV2Response {
    id: string;
    session_url: string;
    session_token: string;
}
