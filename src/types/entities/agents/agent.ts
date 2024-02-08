import { Chat, ChatPayload, ChatResponse } from './chat';
import { Knowledge } from './knowledge';
import { LLM } from './llm';
import { Presenter } from './presenter';

export interface Agent {
    id: string;
    username?: string;
    presenter: Presenter;
    llm?: LLM;
    knowledge?: Knowledge;
    use_case?: string;
    tags?: string[];
    chats?: number;
    access?: 'private' | 'pending-public' | 'unlisted' | 'rejected' | 'public';

    preview_name?: string;
    preview_description?: string;
    preview_thumbnail?: string;
}

export type AgentPayload = Omit<Agent, 'type' | 'created_at' | 'modified_at' | 'id' | 'owner_id' | 'idle_video_url'>;

export interface AgentsAPI {
    create(payload: AgentPayload, options?: RequestInit): Promise<Agent>;
    getAgents(tag?: string, options?: RequestInit): Promise<Agent[]>;
    getById(id: string, options?: RequestInit): Promise<Agent>;
    delete(id: string, options?: RequestInit): Promise<void>;
    update(id: string, payload: AgentPayload, options?: RequestInit): Promise<Agent>;
    newChat(agentId: string, options?: RequestInit): Promise<Chat>;
    chat(agentId: string, chatId: string, payload: ChatPayload, options?: RequestInit): Promise<ChatResponse>;
}