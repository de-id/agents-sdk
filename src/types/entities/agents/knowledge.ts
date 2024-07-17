export type KnowledgeProvider = 'pinecone' | 'redis';

export interface KnowledgeEmbedder {
    provider: string;
    model: string;
    is_limited_language?: boolean;
}

export interface Knowledge {
    id: string;
    provider: KnowledgeProvider;
    starter_message?: string[];
    embedder?: KnowledgeEmbedder;
}
