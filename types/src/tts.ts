export enum Providers {
    Amazon = 'amazon',
    Microsoft = 'microsoft',
    Afflorithmics = 'afflorithmics',
    Elevenlabs = 'elevenlabs',
}

export enum VoiceAccess {
    Public = 'public',
    Premium = 'premium',
    Private = 'private',
}

export interface IVoice {
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
export interface Elevenlabs_tts_provider {
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
 * Afflorithmics provider details, contains the provider type and requested voice id, available for enterprise users.
 */
export interface Afflorithmics_tts_provider {
    type: Providers.Afflorithmics;

    /**
     * The voice_id from the list of available voices.
     * @example "abc123DEF456"
     * @default abc123DEF456
     */
    voice_id: string;

    /**
     * Voice customization options. Read more here: https://docs.audiostack.ai/reference/postspeech
     */
    voice_config?: VoiceConfigAfflorithmics;
}

/**
 * AzureMicrosoft provider details, contains the provider type and requested voice id and style
 */
export interface Microsoft_tts_provider {
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
 * Amazon provider details, contains the provider type and requested voice id
 */
export interface Amazon_tts_provider {
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

export interface VoiceConfigAfflorithmics {
    /**
     * The speed of the voice.
     * The value is relative to 1, 0.5 being half speed, 2 being twice as fast, etc.
     * Another option is a constant value from x-slow/slow/medium/fast/x-fast.
     * @example "1.2"
     * @min 0.5
     * @max 1.5
     * @default 1
     */
    rate?: string;

    /**
     * Amount of microseconds for silence padding. Half of the amount is inserted as silence at the beginning and at the end of each Speech file.
     */
    silencePadding?: number;

    /**
     * Flag to apply lexicographical text corrections
     */
    voiceIntelligence?: boolean;
}

export type TextToSpeechProviders = Microsoft_tts_provider | Afflorithmics_tts_provider | Elevenlabs_tts_provider;
export type ExtendedTextToSpeechProviders = TextToSpeechProviders | Amazon_tts_provider;
export type StreamTextToSpeechProviders =
    | Microsoft_tts_provider
    | Afflorithmics_tts_provider
    | Elevenlabs_tts_provider
    | Amazon_tts_provider;
