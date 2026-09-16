import { Message } from './entities';
import { TtsProvider } from './voice/tts';

/**
 * A script that makes the agent say text you supply, synthesised by a text-to-speech provider.
 *
 * The usual payload for {@link AgentManager.speak | speak()}. The agent's LLM is not involved, so
 * the agent says exactly what {@link TextStreamScript.input | input} contains — which is what makes
 * it the right script for greetings and other canned lines. Passing a plain string to
 * {@link AgentManager.speak | speak()} is shorthand for this script with `ssml` set to `false`.
 *
 * @example Text
 * ```ts
 * const speak = await agentManager.speak({
 *     type: 'text',
 *     input: "Hi! I'm Alice!",
 * });
 * ```
 * @example Text with sentiment
 * `sentiment` is for Expressive (V4) agents only. If the requested sentiment is not supported by
 * the agent, the default sentiment is used.
 * ```ts
 * const speak = await agentManager.speak({
 *     type: 'text',
 *     input: "Hi! I'm Alice!",
 *     sentiment: 'friendly',
 * });
 * ```
 * @category Speak & Scripts
 */
export interface TextStreamScript {
    /**
     * Which kind of script this is. Always `text` for this variant; an
     * {@link AudioStreamScript} carries `audio` instead.
     */
    type: 'text';

    /**
     * The text-to-speech provider and voice that synthesise
     * {@link TextStreamScript.input | input}, from the list of supported providers.
     *
     * One of the objects in {@link TtsProvider}: a `type` naming the provider, the
     * `voice_id` to speak with, and optional provider-specific `voice_config`. Leave it out and the
     * SDK sends the script without a provider, so the voice is chosen server-side; the Agents API
     * documents Microsoft TTS as its default when no provider is given.
     */
    provider?: TtsProvider;

    /**
     * The text to be synthesised into speech.
     *
     * Each provider has its own limit on the text length.
     * @example "This is an example text"
     * @maxLength 40000
     * @minLength 3
     */
    input: string;

    /**
     * Is the text provided in ssml form.
     *
     * Set it to `true` when {@link TextStreamScript.input | input} is SSML markup rather than plain
     * text, so the provider reads the tags instead of speaking them.
     * @default false
     */
    ssml?: boolean;

    /**
     * Queue this speak behind the current speech instead of interrupting it. Expressive (V4)
     * agents only.
     * @default false
     */
    should_queue_speaks?: boolean;

    /**
     * Sentiment name to speak with. Expressive (V4) agents only; if the agent does not support the
     * requested sentiment, its default sentiment is used.
     * @example "friendly"
     */
    sentiment?: string;
}

/**
 * A script that makes the agent lip-sync an audio file you host, with no text-to-speech involved.
 *
 * The other payload {@link AgentManager.speak | speak()} accepts. Use it when the audio already
 * exists — a recording, or speech you synthesised yourself — instead of having a provider generate
 * it from text.
 *
 * @example Audio file
 * ```ts
 * const speak = await agentManager.speak({
 *     type: 'audio',
 *     audio_url: 'https://www.yourwebsite.com/audio.mp3',
 * });
 * ```
 * @category Speak & Scripts
 */
export interface AudioStreamScript {
    /**
     * Which kind of script this is. Always `audio` for this variant; a
     * {@link TextStreamScript} carries `text` instead.
     */
    type: 'audio';

    /**
     * URL of the audio file the agent lip-syncs to.
     *
     * The URL has to be publicly reachable, since the file is fetched server-side rather than
     * uploaded from the browser. The file may be at most 15 MB.
     * @example "https://www.yourwebsite.com/audio.mp3"
     */
    audio_url: string;
}

/**
 * Script variant that has the agent's LLM generate the response to speak, rather than supplying text or audio directly.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface LlmStreamScript {
    type: 'llm';
    provider: TtsProvider;
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

/**
 * The script payload {@link AgentManager.speak | speak()} accepts: text or audio.
 *
 * Discriminated by its `type` field, so `'text'` narrows the object to {@link TextStreamScript}
 * and `'audio'` to {@link AudioStreamScript}.
 * {@link AgentManager.speak | speak()} additionally takes a plain string, as shorthand for a
 * {@link TextStreamScript} with that string as its `input`.
 *
 * @category Speak & Scripts
 */
export type SpeakScript = TextStreamScript | AudioStreamScript;
