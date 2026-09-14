import { Message } from './entities';
import { StreamTextToSpeechProviders } from './voice/tts';

export type StreamScriptType = 'text' | 'audio';
export interface BaseStreamScript {
    type: StreamScriptType;
}

export interface Stream_Text_Script extends BaseStreamScript {
    /**
     * The type of the script.
     */
    type: 'text';

    /**
     * text-to-speech provider from list of supported providers. default is microsoft tts
     */
    provider?: StreamTextToSpeechProviders;

    /**
     * The input text that will be synthesized to an audio file.
     * Note that each provider has its own limitations on the text length.
     * @example "This is an example text"
     * @maxLength 40000
     * @minLength 3
     */
    input: string;

    /**
     * Is the text provided in ssml form.
     * @default false
     */
    ssml?: boolean;

    /**
     * Queue this speak behind the current speech instead of interrupting it (expressive avatars only).
     * @default false
     */
    should_queue_speaks?: boolean;

    /**
     * Sentiment name to speak with (expressive avatars only).
     * If the sentiment is not supported by the agent, the default sentiment is used.
     * @example "friendly"
     */
    sentiment?: string;
}

export interface Stream_Audio_Script extends BaseStreamScript {
    /**
     * The type of the script.
     */
    type: 'audio';

    /**
     * The URL of the audio file which will be used by the actor.
     * File size is limit to 15MB.
     */
    audio_url: string;
}

/**
 * Script variant that has the agent's LLM generate the response to speak, rather than supplying text or audio directly.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface Stream_LLM_Script {
    type: 'llm';
    provider: StreamTextToSpeechProviders;
    ssml?: boolean;
    llm: {
        messages: Message[];
        provider: 'openai';
    };
    input?: string;
    stream_audio?: boolean;
}

/**
 * Union of every script variant accepted internally, including the LLM-generated variant not exposed to consumers.
 * @internal Implementation type; not part of the public SDK surface.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export type StreamScript = Stream_Text_Script | Stream_Audio_Script | Stream_LLM_Script;
export type SupportedStreamScript = Stream_Text_Script | Stream_Audio_Script;
