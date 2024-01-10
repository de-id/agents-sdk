import { StreamTextToSpeechProviders } from './tts';

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

export type StreamScript = Stream_Text_Script | Stream_Audio_Script;
