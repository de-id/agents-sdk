export type LLMProvider = 'openai' | 'custom';

export type AgentTemplate = 'rag-grounded' | 'rag-ungrounded' | 'assistant';

export interface PromptCustomization {
    role?: string;
    personality?: string;
    topics_to_avoid?: string[];
    max_response_length?: number;
    knowledge_source?: 'base_knowledge' | 'documents' | null;
}

export interface LLM {
    provider: LLMProvider;
    prompt_version?: 'v1' | 'v2' | null;
    instructions?: string;
    template?: AgentTemplate;
    prompt_customization?: PromptCustomization;
    temperature?: number;
    custom?: {
        api_key?: string;
        url?: string;
        streaming?: boolean;
    };
}
