export enum TransportProvider {
    Livekit = 'livekit',
}

export interface CreateStreamV2Options {
    transport_provider: TransportProvider.Livekit;
    chat_id?: string;
}

export interface CreateStreamV2Response {
    agent_id: 'string';
    session_id: 'string';
    session_url: 'string';
    session_token: 'string';
}
