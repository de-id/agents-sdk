import { ExtendedTextToSpeechProviders } from '@sdk/types/voice/tts';
import { Rect } from '../../face-rect';

export type videoType = 'talk' | 'clip' | 'expressive';

export type Presenter = TalkPresenter | ClipPresenter | ExpresivePresenter;

export interface BasePresenter {
    type: videoType;
    voice?: ExtendedTextToSpeechProviders & { language?: string };
    idle_video?: string;
    thumbnail?: string;
}

export interface TalkPresenter extends BasePresenter {
    type: 'talk';
    source_url: string;
    driver_url?: string;
    stitch?: boolean;
    face?: Rect;
}

export interface ClipPresenter extends BasePresenter {
    type: 'clip';
    driver_id: string;
    background?: string;
    presenter_id: string;
    is_greenscreen?: boolean;
}

export interface ExpresivePresenter extends BasePresenter {
    type: 'expressive';
}
