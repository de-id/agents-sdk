export enum Providers {
    Amazon = 'amazon',
    AzureOpenAi = 'azure-openai',
    Microsoft = 'microsoft',
    Elevenlabs = 'elevenlabs',
}

export enum VoiceAccess {
    Public = 'public',
    Premium = 'premium',
    Private = 'private',
}

export interface Voice {
    id: string;
    name: string;
    gender: string;
    locale: string;
    access: VoiceAccess;
    provider: Providers;
    styles: string[];
    language: string;
}

/**
 * Elevenlabs provider details, contains the provider type and requested voice id, available for premium users.
 */
export interface ElevenlabsTtsProvider {
    type: Providers.Elevenlabs;

    /**
     * The voice_id from the list of available voices. https://api.elevenlabs.io/v1/voices.
     * @example "21m00Tcm4TlvDq8ikWAM"
     * @default 21m00Tcm4TlvDq8ikWAM
     */
    voice_id: string;

    /**
     * Voice customization options. Read more here: https://docs.elevenlabs.io/speech-synthesis/voice-settings
     */
    voice_config?: VoiceConfigElevenlabs;
}

/**
 * AzureMicrosoft provider details, contains the provider type and requested voice id and style
 */
export interface MicrosoftTtsProvider {
    type: Providers.Microsoft;

    /**
     * The voice_id from the list of available voices.
     * For full list of voice_ids: https://docs.d-id.com/reference/microsoft-azure
     * @example "en-US-JennyNeural"
     * @default en-US-JennyNeural
     */
    voice_id: string;

    /**
     * Voice customization options
     */
    voice_config?: VoiceConfigMicrosoft;

    /**
     * Voice name
     */
    voice_name?: string;

    /**
     * Voice language
     */
    voice_language?: string;
}

/**
 * AzureOpenAi provider details, contains the provider type and requested voice id and style
 */
export interface AzureOpenAiTtsProvider extends Omit<MicrosoftTtsProvider, 'type'> {
    type: Providers.AzureOpenAi;
}

/**
 * Amazon provider details, contains the provider type and requested voice id
 */
export interface AmazonTtsProvider {
    type: Providers.Amazon;

    /**
     * The voice_id from the list of available voices.
     * For full list of voice_ids: https://docs.d-id.com/reference/text-to-speech-providers
     * @example "Joanna"
     */
    voice_id: string;
}
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

export interface VoiceConfigElevenlabs {
    /**
     * How stable the voice is and the randomness of each new generation.
     * @example "0"
     */
    stability?: number;

    /**
     * The similarity slider dictates how closely the AI should adhere to the original voice when attempting to replicate it.
     * @example "0"
     */
    similarity_boost?: number;
}

export type TextToSpeechProviders = MicrosoftTtsProvider | AzureOpenAiTtsProvider | ElevenlabsTtsProvider;
export type ExtendedTextToSpeechProviders = TextToSpeechProviders | AmazonTtsProvider;
export type StreamTextToSpeechProviders =
    | MicrosoftTtsProvider
    | AzureOpenAiTtsProvider
    | ElevenlabsTtsProvider
    | AmazonTtsProvider;
