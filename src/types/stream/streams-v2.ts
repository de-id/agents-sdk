export enum TransportProvider {
    Livekit = 'livekit',
}

export interface CreateSessionV2Options {
    transport: {
        provider: TransportProvider.Livekit;
    };
    chat_persist?: boolean;
    verbose?: boolean;
}

export interface CreateSessionV2Response {
    id: string;
    session_url: string;
    session_token: string;
    interrupt_enabled: boolean;
    verbose?: boolean;
}
