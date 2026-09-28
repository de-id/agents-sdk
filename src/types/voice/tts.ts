/**
 * The text-to-speech engines a voice in D-ID's catalog can be served by.
 *
 * The value of {@link Voice.provider}, and of the `type` field that discriminates the provider
 * objects a speak script accepts: {@link Providers.Microsoft} selects a {@link MicrosoftTtsProvider},
 * {@link Providers.Elevenlabs} an {@link ElevenlabsTtsProvider} and {@link Providers.AzureOpenAi}
 * an {@link AzureOpenAiTtsProvider}. The other values appear only in the catalog.
 *
 * @category Voice
 */
export enum Providers {
    /** Amazon Polly. Catalog only: agents cannot speak with an Amazon voice. */
    Amazon = 'amazon',
    /** Azure OpenAI text-to-speech; see {@link AzureOpenAiTtsProvider}. */
    AzureOpenAi = 'azure-openai',
    /** Microsoft Azure text-to-speech; see {@link MicrosoftTtsProvider}. */
    Microsoft = 'microsoft',
    /** ElevenLabs text-to-speech; see {@link ElevenlabsTtsProvider}. */
    Elevenlabs = 'elevenlabs',
    /** Cartesia text-to-speech. Available as the configured voice of Expressive (V4) agents only. */
    Cartesia = 'cartesia',
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
    /** Available to every account. */
    Public = 'public',
    /** Available to accounts whose plan includes premium voices. */
    Premium = 'premium',
    /** Available only to the account the voice belongs to. */
    Private = 'private',
    /** A voice from the account's own ElevenLabs account, used with its ElevenLabs API key. */
    ExternalPrivate = 'external-private',
}

/**
 * One voice in D-ID's catalog of text-to-speech voices.
 *
 * The SDK does not fetch voices itself; the type is exported so an application that lists them —
 * to build a voice picker, say — can type the result and then feed {@link Voice.id | id} and
 * {@link Voice.provider | provider} into the provider object it passes as
 * {@link TextStreamScript.provider}. {@link Voice.provider | provider} is the wide
 * {@link Providers} enum, while each provider variant requires its own literal `type`, so switch
 * on it to build the matching variant, for example {@link Providers.Elevenlabs} to an
 * {@link ElevenlabsTtsProvider}. The catalog also lists voices agents cannot speak with (Google
 * voices, for example), so keep only the providers {@link TtsProvider} has a variant for.
 *
 * @category Voice
 */
export interface Voice {
    /** Identifier of the voice: the value to pass as a provider object's `voice_id`. */
    id: string;
    /** Display name of the voice. */
    name: string;
    /** The gender the voice is labelled with. */
    gender: string;
    /** Each language the voice speaks, with its locale code such as `en-US`. */
    languages: {
        /** The language, as a name such as `English`. */
        language: string;
        /** Its locale code, such as `en-US`. */
        locale: string;
        /** The accent, when the catalog names one. */
        accent?: string;
    }[];
    /** Which accounts may use the voice. See {@link VoiceAccess}. */
    access: VoiceAccess;
    /** The provider that serves the voice. See {@link Providers}. */
    provider: Providers;
    /** The speaking styles this particular voice offers, for example as a
     * {@link VoiceConfigMicrosoft.style | style}. Styles differ from voice to voice. */
    styles: string[];
    /** The language of the voice, as a name rather than a locale code, when the catalog sets one. */
    language?: string;
}

/**
 * Selects an ElevenLabs voice for {@link TextStreamScript.provider}. Available on paid plans.
 *
 * @category Voice
 */
export interface ElevenlabsTtsProvider {
    /** `'elevenlabs'`, or {@link Providers.Elevenlabs}. */
    type: `${Providers.Elevenlabs}`;

    /**
     * Id of the voice to speak with, from D-ID's list of ElevenLabs voices.
     *
     * @example "21m00Tcm4TlvDq8ikWAM"
     * @see [ElevenLabs voices](https://docs.d-id.com/docs/tts-elevenlabs)
     */
    voice_id: string;

    /** Voice settings; see {@link VoiceConfigElevenlabs}. */
    voice_config?: VoiceConfigElevenlabs;
}

/**
 * Selects a Microsoft Azure voice for {@link TextStreamScript.provider}.
 *
 * @category Voice
 */
export interface MicrosoftTtsProvider {
    /** `'microsoft'`, or {@link Providers.Microsoft}. */
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
 * Selects an Azure OpenAI voice for {@link TextStreamScript.provider}.
 *
 * The same shape as {@link MicrosoftTtsProvider}, with the `type` naming Azure OpenAI. Azure
 * ignores `voice_config.rate` for these voices.
 *
 * @category Voice
 */
export interface AzureOpenAiTtsProvider extends Omit<MicrosoftTtsProvider, 'type'> {
    /** `'azure-openai'`, or {@link Providers.AzureOpenAi}. */
    type: `${Providers.AzureOpenAi}`;
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
    /** Speaking style, such as `cheerful`; {@link Voice.styles} lists what a voice offers. */
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
 * ElevenLabs voice settings: how stable the voice is and how closely it adheres to the source voice.
 *
 * The `voice_config` of {@link ElevenlabsTtsProvider}. Every field is optional.
 *
 * @see [ElevenLabs on D-ID](https://docs.d-id.com/docs/tts-elevenlabs)
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
 * The provider object a speak script accepts.
 *
 * This is the type of {@link TextStreamScript.provider}. Pick the variant for the provider you
 * want and give it the `voice_id` to speak with and an optional `voice_config`; `type`
 * discriminates the union.
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
export type TtsProvider = MicrosoftTtsProvider | AzureOpenAiTtsProvider | ElevenlabsTtsProvider;
