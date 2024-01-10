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
