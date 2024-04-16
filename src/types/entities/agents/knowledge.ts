export type KnowledgeProvider = 'pinecone' | 'redis';

export interface KnowledgeEmbedder {
    provider: string;
    model: string;
}

export interface Knowledge {
    id: string;
    provider: KnowledgeProvider;
    starter_message?: string[];
    embedder?: KnowledgeEmbedder;
}
