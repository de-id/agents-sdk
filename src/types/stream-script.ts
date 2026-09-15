import { Message } from './entities';
import { StreamTextToSpeechProviders } from './voice/tts';

/**
 * Discriminator values of the script variants a consumer can pass to `speak()`.
 * @internal Implementation type; not part of the public SDK surface.
 */
export type StreamScriptType = 'text' | 'audio';

/**
 * Common base of the script variants, carrying only the `type` discriminator.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface BaseStreamScript {
    type: StreamScriptType;
}

export interface TextStreamScript extends BaseStreamScript {
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

export interface AudioStreamScript extends BaseStreamScript {
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
 */
export interface LlmStreamScript {
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
 */
export type StreamScript = TextStreamScript | AudioStreamScript | LlmStreamScript;
export type SupportedStreamScript = TextStreamScript | AudioStreamScript;
