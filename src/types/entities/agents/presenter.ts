import { ExtendedTextToSpeechProviders } from '@sdk/types/voice/tts';
import { Rect } from '../../face-rect';
import { VideoType } from '../video';

export type Presenter = TalkPresenter | ClipPresenter | ExpresivePresenter;

export interface BasePresenter {
    type: VideoType;
    voice?: ExtendedTextToSpeechProviders & { language?: string };
    idle_video?: string;
    thumbnail?: string;
}

export interface TalkPresenter extends BasePresenter {
    type: VideoType.Talk;
    source_url: string;
    driver_url?: string;
    stitch?: boolean;
    face?: Rect;
}

export interface ClipPresenter extends BasePresenter {
    type: VideoType.Clip;
    driver_id: string;
    background?: string;
    presenter_id: string;
    is_greenscreen?: boolean;
}

export interface ExpresivePresenter extends BasePresenter {
    type: VideoType.Expressive;
    presenter_id: string;
}
