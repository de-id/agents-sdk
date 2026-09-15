import { AvatarType } from '../avatar';
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

/**
 * The avatar an agent speaks through: its rendering tier and the language of its voice.
 *
 * `type` decides how the SDK connects — Talks (V2) and Clips (V3) agents stream over WebRTC,
 * Expressive (V4) agents over LiveKit — and therefore which of the Expressive-only methods on
 * `AgentManager` do anything. The voice itself is resolved server-side; only its language is exposed.
 *
 * @category Agent Manager
 */
export interface AgentAvatar {
    /**
     * Rendering tier of the avatar.
     */
    type: AvatarType;

    /**
     * Voice the agent speaks with, reduced to the language the SDK needs for speech-to-text.
     */
    voice?: { language?: string };
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
    avatar: AgentAvatar;
    vision?: { enabled: boolean };
    end_of_call_feedback?: EndOfCallFeedbackConfig;
    triggers_available?: boolean;
    advanced_settings?: { ui_debug_mode?: boolean; vm_account_id?: string; closed_captions_enabled?: boolean };
    ld_context?: { key: string; hash_key: string; plan_group: string };
}

/**
 * Internal HTTP client surface used by the agent manager to talk to the Agents API.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface AgentsAPI {
    getRuntimeById(id: string, options?: RequestInit): Promise<Agent>;
    newChat(agentId: string, payload: { persist: boolean }, options?: RequestInit): Promise<Chat>;
    chat(agentId: string, chatId: string, payload: ChatPayload, options?: RequestInit): Promise<ChatResponse>;
}
