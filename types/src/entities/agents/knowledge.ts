export type KnowledgeProvider = 'pinecone' | 'redis';

export interface KnowledgeEmbedder {
    provider: string;
    model: string;
}

export interface Knowledge {
    id: string;
    provider: KnowledgeProvider;
    embedder?: KnowledgeEmbedder;
}
