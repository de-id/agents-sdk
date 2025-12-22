export enum TransportProvider {
    Livekit = 'livekit',
}

export interface CreateStreamV2Options {
    transport_provider: TransportProvider.Livekit;
    chat_id?: string;
}

export interface CreateStreamV2Response {
    id: string;
    session_url: string;
    session_token: string;
}
