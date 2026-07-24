import { Chat, ChatPayload, ChatResponse } from './chat';

export interface EndOfCallFeedbackConfig {
    enabled: boolean;
    closing_message?: string;
    follow_up_enabled?: boolean;
    follow_up_messages?: {
        low?: string;
        four?: string;
        five?: string;
    };
}

export interface Agent {
    id: string;
    owner_id?: string;
    name?: string;
    access?: 'public';
    thumbnail?: string;
    greetings?: string[];
    starter_message?: string[];
    idle_video?: string;
    knowledge?: { id: string; embedder?: { is_limited_language?: boolean } };
    avatar: { type: 'talk' | 'clip' | 'expressive'; voice?: { language?: string } };
    vision?: { enabled: boolean };
    end_of_call_feedback?: EndOfCallFeedbackConfig;
    triggers_available?: boolean;
    advanced_settings?: { ui_debug_mode?: boolean; vm_account_id?: string };
}

export interface AgentsAPI {
    getRuntimeById(id: string, options?: RequestInit): Promise<Agent>;
    newChat(agentId: string, payload: { persist: boolean }, options?: RequestInit): Promise<Chat>;
    chat(agentId: string, chatId: string, payload: ChatPayload, options?: RequestInit): Promise<ChatResponse>;
}
