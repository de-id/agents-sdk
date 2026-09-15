import { AvatarType } from '../avatar';
import { Chat, ChatPayload, ChatResponse } from './chat';

/**
 * The end-of-call feedback form configured on an agent.
 *
 * It describes what to ask the user when the conversation ends; the SDK does not render anything
 * itself. Read it from {@link Agent.end_of_call_feedback}, show your own form when
 * {@link EndOfCallFeedbackConfig.enabled | enabled} is set, and send the result with
 * {@link AgentManager.submitFeedback | submitFeedback()}.
 *
 * @category Agent Manager
 */
export interface EndOfCallFeedbackConfig {
    /** Whether the agent is configured to ask for feedback when a call ends. */
    enabled: boolean;
    /** The line to show the user as the call ends, before the rating is asked for. */
    closing_message?: string;
    /** Whether a free-text follow-up question should be asked after the rating. */
    follow_up_enabled?: boolean;
    /**
     * The follow-up question to ask, chosen by the score the user gave.
     *
     * Whichever one you show is what {@link AgentManager.submitFeedback | submitFeedback()} records
     * as {@link SubmitFeedbackResponse.question_shown | question_shown}.
     */
    follow_up_messages?: {
        /** Question for a score at the low end of the scale. */
        low?: string;
        /** Question for a score of 4. */
        four?: string;
        /** Question for a score of 5. */
        five?: string;
    };
}

/**
 * The avatar an agent speaks through: its rendering tier and the language of its voice.
 *
 * The value of {@link Agent.avatar}. Its `type` is the single most important field on an agent: it
 * decides which transport the session uses and therefore which SDK features work.
 *
 * @category Agent Manager
 */
export interface AgentAvatar {
    /**
     * The kind of avatar: {@link AvatarType.Talk | talk} for Talks (V2), {@link AvatarType.Clip | clip}
     * for Clips (V3), {@link AvatarType.Expressive | expressive} for Expressive (V4).
     *
     * Talks (V2) and Clips (V3) agents stream over WebRTC and receive their events on the
     * notifications web socket; Expressive (V4) agents connect to a real-time session instead, which
     * is what makes the microphone, camera, client tool and data-channel methods of
     * {@link AgentManager} available.
     */
    type: AvatarType;
    /** The voice the agent speaks with. */
    voice?: {
        /**
         * Language of the configured voice. The SDK reports it in analytics; it does not change how
         * the session behaves.
         */
        language?: string;
    };
}

/**
 * An agent's profile, as the Agents API returns it.
 *
 * The SDK fetches it once while {@link createAgentManager} runs and exposes it as
 * {@link AgentManager.agent}, so everything here is available before
 * {@link AgentManager.connect | connect()} — which is what makes it useful for rendering the agent
 * before the video exists. The fields are the agent's configuration, whether it was set in D-ID Studio
 * or through the Agents API; most of them are for the application to use, and each one below says
 * where the SDK itself reads it.
 *
 * @see [Get an agent](https://docs.d-id.com/reference/agent-get)
 * @category Agent Manager
 */
export interface Agent {
    /** Id of the agent: the same value passed to {@link createAgentManager}. */
    id: string;
    /** Id of the D-ID account that owns the agent. Set by the Agents API. */
    owner_id?: string;
    /** The agent's display name. */
    name?: string;
    /** `'public'` when the agent is configured for public access; omitted otherwise. */
    access?: 'public';
    /** URL of the agent's still image. Use it as the poster of your video element before
     * {@link AgentManager.connect | connect()} has a stream to show. */
    thumbnail?: string;
    /**
     * The greeting lines configured for the agent.
     *
     * The SDK never speaks them by itself: pass one to {@link AgentManager.speak | speak()} once
     * the agent is connected if you want the agent to open the conversation. Check what your own
     * agent does first — an Expressive (V4) session's server side may greet on its own, in which
     * case speaking a greeting as well says it twice.
     */
    greetings?: string[];
    /**
     * Suggested opening questions to offer the user.
     *
     * The SDK surfaces the same array as {@link AgentManager.starterMessages | starterMessages}.
     */
    starter_message?: string[];
    /**
     * URL of the agent's looping idle video.
     *
     * Show it while the agent is not speaking: put it on your video element's `src` when
     * {@link AgentManagerCallbacks.onVideoStateChange | onVideoStateChange} reports `STOP`.
     */
    idle_video?: string;
    /**
     * The knowledge base attached to the agent, when it has one.
     *
     * Its presence is what tells you the agent can cite sources; the citations themselves arrive on
     * each answer as {@link Message.matches | matches}.
     */
    knowledge?: {
        /**
         * Id of the knowledge base.
         *
         * The SDK sends it with every rating made by {@link AgentManager.rate | rate()}, and it is
         * the {@link RetrievalMetadata.knowledge_id | knowledge_id} of the citations on an answer.
         */
        id: string;
        /** The embedding model the knowledge base was indexed with. The SDK does not act on it. */
        embedder?: {
            /** Whether that embedding model covers only a limited set of languages, so knowledge
             * written in another language may not be retrieved well. */
            is_limited_language?: boolean;
        };
    };
    /**
     * The avatar the agent is built on.
     *
     * Its `type` is the single most important field on an agent: it decides which transport the
     * session uses and therefore which SDK features work. See {@link AgentAvatar}.
     */
    avatar: AgentAvatar;
    /**
     * Whether vision is enabled for the agent.
     *
     * Exposed so an application can decide whether to offer the camera; the SDK does not read it,
     * and publishing a camera stream is an Expressive (V4) feature — see
     * {@link AgentManager.publishCameraStream | publishCameraStream()}.
     */
    vision?: {
        /** `true` when the agent is configured to use the user's camera. */
        enabled: boolean;
    };
    /**
     * The end-of-call feedback form configured for the agent.
     *
     * The SDK does not read it: render your own form from it and submit the result with
     * {@link AgentManager.submitFeedback | submitFeedback()}. See
     * {@link EndOfCallFeedbackConfig}.
     */
    end_of_call_feedback?: EndOfCallFeedbackConfig;
    /** Whether the agent has triggers configured. The SDK does not act on them. */
    triggers_available?: boolean;
    /** Settings that change how D-ID's own surfaces present the agent. */
    advanced_settings?: {
        /**
         * Whether the SDK logs its streaming lifecycle to the browser console.
         *
         * When it is enabled the SDK turns debug logging on for every visitor, whatever
         * {@link AgentManagerOptions.debug | debug} was passed to {@link createAgentManager}.
         */
        ui_debug_mode?: boolean;
        /**
         * Account the agent's rendering VM is billed to.
         *
         * @internal D-ID internal; not part of the public SDK contract.
         */
        vm_account_id?: string;
        /** Whether the embedding UI should show closed captions. The SDK does not act on it. */
        closed_captions_enabled?: boolean;
    };
    /**
     * Feature-flag targeting context for the account this agent belongs to.
     *
     * @internal D-ID internal; not part of the public SDK contract.
     */
    ld_context?: {
        /** Key identifying the context. */
        key: string;
        /** Hashed form of the key. */
        hash_key: string;
        /** The plan group the account falls into. */
        plan_group: string;
    };
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
