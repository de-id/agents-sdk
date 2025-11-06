export enum Transport {
    Livekit = 'livekit',
}

export interface CreateStreamV2Options {
    transport_provider: Transport.Livekit;
    chat_id?: string;
}

export interface CreateStreamV2Response {
    agent_id: 'string';
    session_id: 'string';
    session_url: 'string';
    session_token: 'string';
}
