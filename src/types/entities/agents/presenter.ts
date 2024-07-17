import { Rect } from '../../face-rect';
import { ExtendedTextToSpeechProviders } from '../../tts';

export type videoType = 'talk' | 'clip';

export type Presenter = TalkPresenter | ClipPresenter;

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
}
