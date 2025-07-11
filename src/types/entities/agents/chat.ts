export enum RateState {
    Unrated = 'Unrated',
    Positive = 'Positive',
    Negative = 'Negative',
}

export interface RatingEntity {
    id: string;
    owner_id: string;
    agent_id: string;
    matches: [string, string][];
    knowledge_id: string;
    external_id: string;
    created_by: string;
    chat_id: string;
    score: 1 | -1;
    created_at: string;
    modified_at: string;
    message_id: string;
}

export type RatingPayload = Omit<
    RatingEntity,
    'owner_id' | 'id' | 'created_at' | 'modified_at' | 'created_by' | 'external_id' | 'agent_id' | 'chat_id'
>;

export interface Message {
    id: string;
    role?: 'system' | 'assistant' | 'user' | 'function' | 'tool';
    content: string;
    created_at?: string;
    matches?: ChatResponse['matches'];
    context?: string;
    videoId?: string;
    interrupted?: boolean;
}

export interface ChatPayload {
    messages: Message[];
    streamId?: string;
    sessionId?: string;
    chatMode?: ChatMode;
}

export interface IRetrivalMetadata {
    id: string;
    data: string;
    title: string;
    document_id: string;
    knowledge_id: string;
    source_url: string;
}

export enum ChatMode {
    Functional = 'Functional',
    TextOnly = 'TextOnly',
    Maintenance = 'Maintenance',
    Playground = 'Playground',
    DirectPlayback = 'DirectPlayback',
}

export interface ChatResponse {
    result?: string;
    documentIds?: string[];
    matches?: IRetrivalMetadata[];
    chatMode?: ChatMode;
    context?: string;
    videoId?: string;
}

export interface Chat {
    id: string;
    agent_id: string;
    created: string;
    modified: string;
    owner_id: string;
    messages: Message[];
    agent_id__created_at: string;
    agent_id__modified_at: string;
    chat_mode?: ChatMode;
}

export interface Interrupt {
    type: 'text' | 'audio' | 'click';
}
