import { Auth } from '../auth';
import { VideoType } from '../entities';
import { CreateClipStreamRequest, CreateTalkStreamRequest, SendClipStreamPayload, SendTalkStreamPayload } from './api';
import { ICreateStreamRequestResponse, IceCandidate, SendStreamPayloadResponse, Status } from './rtc';

export type CompatibilityMode = 'on' | 'off' | 'auto';

export enum StreamingState {
    Start = 'START',
    Stop = 'STOP',
}

export enum StreamEvents {
    ChatAnswer = 'chat/answer',
    ChatPartial = 'chat/partial',
    StreamDone = 'stream/done',
    StreamStarted = 'stream/started',
}

export interface ManagerCallbacks {
    /**
     * Triggered each time when stream manager recieve new message
     * @param event 
     * @param data 
     */
    onMessage?: (event: string, data: string) => void;
    /**
     * Triggered each time the RTC connection changes state
     * @param state
     */
    onConnectionStateChange?: (state: RTCIceConnectionState) => void;
    /**
     * Optional callback function that will be triggered each time video events happen
     * @param state
     */
    onVideoStateChange?: (state: StreamingState, stats?: SlimRTCStatsReport[]) => void;
    /**
     * Optional callback function that will be triggered each time any changes happen in the chat
     * @param progress
     */
    onSrcObjectReady?: (value: MediaStream) => void;
}

export type ManagerCallbackKeys = keyof ManagerCallbacks;
export interface TalkStreamOptions extends CreateTalkStreamRequest {
    videoType: VideoType.Talk;
}

export interface ClipStreamOptions extends CreateClipStreamRequest {
    videoType: VideoType.Clip;
}

export type CreateStreamOptions = TalkStreamOptions | ClipStreamOptions;

export type PayloadType<T> = T extends TalkStreamOptions
    ? SendTalkStreamPayload
    : T extends ClipStreamOptions
      ? SendClipStreamPayload
      : never;

export interface RtcApi {
    createStream(options: CreateStreamOptions): Promise<ICreateStreamRequestResponse>;
    startConnection(streamId: string, answer: RTCSessionDescriptionInit, sessionId?: string): Promise<Status>;
    addIceCandidate(streamId: string, candidate: IceCandidate, sessionId: string): Promise<Status>;
    sendStreamRequest(
        streamId: string,
        sessionId: string,
        payload: SendClipStreamPayload | SendTalkStreamPayload
    ): Promise<SendStreamPayloadResponse>;
    close(streamId: string, sessionId: string): Promise<Status>;
}

export interface StreamingManagerOptions {
    callbacks: ManagerCallbacks;
    baseURL?: string;
    debug?: boolean;
    auth: Auth;
}

export interface SlimRTCStatsReport {
    index: number;
    timestamp: any;
    bytesReceived: any;
    packetsReceived: any;
    packetsLost: any;
    jitter: any;
    frameWidth: any;
    frameHeight: any;
    frameRate: any;
}
