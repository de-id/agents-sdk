/**
 * The text-to-speech engines a voice can be served by.
 *
 * The value of the `type` field that discriminates the provider objects — {@link Providers.Microsoft}
 * selects a {@link MicrosoftTtsProvider}, {@link Providers.Elevenlabs} an
 * {@link ElevenlabsTtsProvider}, and so on — and of {@link Voice.provider} when you look a voice up
 * in D-ID's catalog. Which providers an account may use depends on its plan.
 *
 * @category Voice
 */
export enum Providers {
    /** Amazon's text-to-speech service; see {@link AmazonTtsProvider}. */
    Amazon = 'amazon',
    /** Azure OpenAI text-to-speech; see {@link AzureOpenAiTtsProvider}. */
    AzureOpenAi = 'azure-openai',
    /** Microsoft Azure text-to-speech, which the Agents API documents as its default when a
     * script names no provider; see {@link MicrosoftTtsProvider}. */
    Microsoft = 'microsoft',
    /** ElevenLabs text-to-speech; see {@link ElevenlabsTtsProvider}. */
    Elevenlabs = 'elevenlabs',
}

/**
 * Who may use a voice.
 *
 * The value of {@link Voice.access}, so an application listing voices can show or hide the ones the
 * account cannot select.
 *
 * @category Voice
 */
export enum VoiceAccess {
    /** As exposed by the voices API: available to every account. */
    Public = 'public',
    /** As exposed by the voices API: available to accounts whose plan includes premium voices. */
    Premium = 'premium',
    /** As exposed by the voices API: available only to the account the voice belongs to. */
    Private = 'private',
}

/**
 * One voice in D-ID's catalog of text-to-speech voices.
 *
 * The SDK does not fetch voices itself; the type is exported so an application that lists them —
 * to build a voice picker, say — can type the result and then feed {@link Voice.id | id} and
 * {@link Voice.provider | provider} into the provider object it passes as
 * {@link TextStreamScript.provider}. {@link Voice.provider | provider} is the wide
 * {@link Providers} enum, while each provider variant requires its own literal `type` — so switch
 * on it to build the matching variant, for example {@link Providers.Elevenlabs} to an
 * {@link ElevenlabsTtsProvider}.
 *
 * @category Voice
 */
export interface Voice {
    /** Identifier of the voice: the value to pass as a provider object's `voice_id`. */
    id: string;
    /** Human-readable name of the voice. */
    name: string;
    /** The gender the voice is labelled with. */
    gender: string;
    /** The locale the voice speaks, such as `en-US`. */
    locale: string;
    /** Which accounts may use the voice. See {@link VoiceAccess}. */
    access: VoiceAccess;
    /** The provider that serves the voice. See {@link Providers}. */
    provider: Providers;
    /** The speaking styles this particular voice offers, for example as a
     * {@link VoiceConfigMicrosoft.style | style}. Styles differ from voice to voice. */
    styles: string[];
    /** The language of the voice, as a name rather than a locale code. */
    language: string;
}

/**
 * ElevenLabs provider details: the provider type and the requested voice id. Available to premium users.
 *
 * Pass it as {@link TextStreamScript.provider} to have ElevenLabs synthesize the text, optionally
 * with {@link VoiceConfigElevenlabs} to control how closely the voice is reproduced.
 *
 * @category Voice
 */
export interface ElevenlabsTtsProvider {
    /**
     * Selects ElevenLabs. Either {@link Providers.Elevenlabs} or its string value `'elevenlabs'` —
     * both are accepted, so the provider object can be written inline without importing the enum.
     */
    type: `${Providers.Elevenlabs}`;

    /**
     * Id of the voice to speak with, from D-ID's list of ElevenLabs voices.
     *
     * @example "21m00Tcm4TlvDq8ikWAM"
     * @see [ElevenLabs voices](https://docs.d-id.com/docs/tts-elevenlabs)
     */
    voice_id: string;

    /**
     * How closely the voice should follow the original it was cloned from. See
     * {@link VoiceConfigElevenlabs}.
     *
     * @see [ElevenLabs voice settings](https://elevenlabs.io/docs/best-practices/prompting/controls)
     */
    voice_config?: VoiceConfigElevenlabs;
}

/**
 * Microsoft Azure provider details: the provider type, the requested voice id and an optional
 * `voice_config` for style, rate and pitch.
 *
 * Pass it as {@link TextStreamScript.provider} to pick a Microsoft Azure voice explicitly,
 * optionally with {@link VoiceConfigMicrosoft} to set style, rate and pitch. The Agents API
 * documents Microsoft TTS as its default when a script names no provider, so this is also the
 * provider a script without one ends up using.
 *
 * @category Voice
 */
export interface MicrosoftTtsProvider {
    /**
     * Selects Microsoft Azure. Either {@link Providers.Microsoft} or its string value
     * `'microsoft'` — both are accepted, so the provider object can be written inline without
     * importing the enum.
     */
    type: `${Providers.Microsoft}`;

    /**
     * Id of the voice to speak with, from D-ID's list of Microsoft Azure voices.
     *
     * @example "en-US-JennyNeural"
     * @see [Microsoft Azure voices](https://docs.d-id.com/docs/tts-microsoft)
     */
    voice_id: string;

    /**
     * How the voice should deliver the text: style, rate and pitch. See
     * {@link VoiceConfigMicrosoft}.
     */
    voice_config?: VoiceConfigMicrosoft;

    /**
     * @internal Not accepted by the Agents API, whose provider schema allows only `type`,
     * `voice_id`, `voice_config` and `language`.
     */
    voice_name?: string;

    /**
     * @internal Not accepted by the Agents API, whose provider schema allows only `type`,
     * `voice_id`, `voice_config` and `language`.
     */
    voice_language?: string;
}

/**
 * Azure OpenAI provider details: the provider type, the requested voice id and an optional
 * `voice_config` for style, rate and pitch.
 *
 * The same shape as {@link MicrosoftTtsProvider} — a `voice_id` and an optional
 * {@link VoiceConfigMicrosoft} as `voice_config` — with the `type` naming Azure OpenAI instead.
 *
 * @category Voice
 */
export interface AzureOpenAiTtsProvider extends Omit<MicrosoftTtsProvider, 'type'> {
    /**
     * Selects Azure OpenAI. Either {@link Providers.AzureOpenAi} or its string value
     * `'azure-openai'` — both are accepted, so the provider object can be written inline without
     * importing the enum.
     */
    type: `${Providers.AzureOpenAi}`;
}

/**
 * Amazon provider details: the provider type and the requested voice id.
 *
 * Pass it as {@link TextStreamScript.provider} to have Amazon synthesize the text. It is the one
 * provider with no `voice_config`: the voice is selected by `voice_id` alone.
 *
 * @category Voice
 */
export interface AmazonTtsProvider {
    /**
     * Selects Amazon. Either {@link Providers.Amazon} or its string value `'amazon'` — both are
     * accepted, so the provider object can be written inline without importing the enum.
     */
    type: `${Providers.Amazon}`;

    /**
     * Id of the voice to speak with, from D-ID's list of Amazon voices.
     *
     * @example "Joanna"
     * @see [Amazon voices](https://docs.d-id.com/docs/tts-amazon)
     */
    voice_id: string;
}

/**
 * How a Microsoft Azure or Azure OpenAI voice should deliver the text.
 *
 * The `voice_config` of {@link MicrosoftTtsProvider} and {@link AzureOpenAiTtsProvider}. Every
 * field is optional; when one is omitted the Agents API applies its own default.
 *
 * @category Voice
 */
export interface VoiceConfigMicrosoft {
    /**
     * The style of the voice.
     * Available styles change between voices.
     */
    style?: string;

    /**
     * The speed of the voice.
     * The value is relative to 1, 0.5 being half speed, 2 being twice as fast, etc.
     * Another option is a constant value from x-slow/slow/medium/fast/x-fast.
     * @example "0.5"
     */
    rate?: string;

    /**
     * The pitch of the voice.
     * Value could be an absolute value in Hz (including units), a relative value in Hz or st(semitones)
     * or a constant value from x-low/low/medium/high/x-high.
     * @example "+2st"
     */
    pitch?: string;
}

/**
 * How closely an ElevenLabs voice should follow the original it was built from.
 *
 * The `voice_config` of {@link ElevenlabsTtsProvider}, mirroring ElevenLabs' own voice settings.
 * Both fields are optional; when one is omitted the Agents API applies its own default.
 *
 * @category Voice
 */
export interface VoiceConfigElevenlabs {
    /**
     * How stable the voice is, and how much each generation varies.
     *
     * A number from 0 to 1: lower is more expressive and more variable between generations, higher
     * is flatter and more repeatable.
     * @example 0.5
     */
    stability?: number;

    /**
     * How closely the synthesized speech should adhere to the original voice it was cloned from.
     *
     * A number from 0 to 1: higher follows the original more strictly.
     * @example 0.5
     */
    similarity_boost?: number;
}

/**
 * The provider object a speak script accepts: any of the four text-to-speech providers.
 *
 * This is the type of {@link TextStreamScript.provider}. Pick the variant for the provider you
 * want, give it the `voice_id` to speak with and, except for {@link AmazonTtsProvider}, an optional
 * `voice_config`; `type` discriminates the union.
 *
 * @example
 * ```ts
 * import { Providers } from '@d-id/client-sdk';
 *
 * const speak = await agentManager.speak({
 *     type: 'text',
 *     input: "Hi! I'm Alice!",
 *     provider: { type: Providers.Microsoft, voice_id: 'en-US-JennyNeural' },
 * });
 * ```
 * @category Voice
 */
export type TtsProvider = MicrosoftTtsProvider | AzureOpenAiTtsProvider | ElevenlabsTtsProvider | AmazonTtsProvider;
