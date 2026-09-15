import { Message } from './entities';
import { StreamTextToSpeechProviders } from './voice/tts';

/**
 * The two kinds of script {@link AgentManager.speak | speak()} accepts.
 *
 * The value of {@link BaseStreamScript.type}, and the discriminant that separates a
 * {@link TextStreamScript} from an {@link AudioStreamScript}: `text` has a text-to-speech provider
 * synthesise the text you supply, `audio` plays an audio file you host.
 *
 * @category Speak & Scripts
 */
export interface TextStreamScript {
    /**
     * The one field every speak script has.
     *
     * {@link TextStreamScript} and {@link AudioStreamScript} both extend it and narrow
     * {@link BaseStreamScript.type | type} to their own literal, so a payload you pass to
     * {@link AgentManager.speak | speak()} is written as one of those two rather than as this
     * interface.
     *
     * @category Speak & Scripts
     */
    /**
     * Which kind of script this is — `text` or `audio`. See {@link StreamScriptType}.
     */

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
    /**
     * The type of the script. Always `text` for this variant.
     */
    type: 'text';

    /**
     * The text-to-speech provider and voice that synthesise
     * {@link TextStreamScript.input | input}, from the list of supported providers.
     *
     * One of the objects in {@link StreamTextToSpeechProviders}: a `type` naming the provider, the
     * `voice_id` to speak with, and optional provider-specific `voice_config`. Leave it out and the
     * SDK sends the script without a provider, so the voice is chosen server-side; the API
     * documents Microsoft TTS as its default when no provider is given.
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
     *
     * Set it to `true` when {@link TextStreamScript.input | input} is SSML markup rather than plain
     * text, so the provider reads the tags instead of speaking them.
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
 *     audio_url: 'http://www.yourwebsite.com/audio.mp3',
 * });
 * ```
 * @category Speak & Scripts
 */
export interface AudioStreamScript {
    /**
     * The type of the script. Always `audio` for this variant.
     */
    type: 'audio';

    /**
     * The URL of the audio file which will be used by the actor.
     * File size is limit to 15MB.
     *
     * The URL has to be publicly reachable, since the file is fetched server-side rather than
     * uploaded from the browser.
     * @example "http://www.yourwebsite.com/audio.mp3"
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

/**
 * The script payload {@link AgentManager.speak | speak()} accepts: text or audio.
 *
 * Discriminated by {@link BaseStreamScript.type | type}, so `'text'` narrows the object to
 * {@link TextStreamScript} and `'audio'` to {@link AudioStreamScript}.
 * {@link AgentManager.speak | speak()} additionally takes a plain string, as shorthand for a
 * {@link TextStreamScript} with that string as its `input`.
 *
 * @category Speak & Scripts
 */
export type SupportedStreamScript = TextStreamScript | AudioStreamScript;
