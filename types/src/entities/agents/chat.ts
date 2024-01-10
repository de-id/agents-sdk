export interface Message {
    role: 'system' | 'assistant' | 'user' | 'function' | 'tool';
    content: string;
    name?: string;
    created_at: string;
}

export interface ChatPayload {
    messages: Message[];
    streamId: string;
    sessionId: string;
}

export interface IRetrivalMetadata {
    id: string;
    data: string;
    title: string;
    document_id: string;
    knowledge_id: string;
    source_url: string;
}

export interface ChatResponse {
    result: string;
    documentIds?: string[];
    matches?: IRetrivalMetadata[];
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
}
