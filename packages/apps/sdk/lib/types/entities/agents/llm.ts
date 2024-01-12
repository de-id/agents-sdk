export type LLMType = 'knowledge' | 'custom';

export type LLM = KnowledgeLLM | CustomLLM;

export interface BaseLLM {
    type: LLMType;
    instructions?: string;
}

export interface KnowledgeLLM extends BaseLLM {
    type: 'knowledge';
    knowledge_id: string;
    store?: string;
}

export interface CustomLLM extends BaseLLM {
    type: 'custom';
    api_key?: string;
    model?: string;
    provider?: string;
    version?: string;
    config?: string;
}
