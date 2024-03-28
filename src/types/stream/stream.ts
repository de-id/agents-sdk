import { AnalyticsProvider } from '$/services/mixpanel';
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
    StreamReady = 'stream/ready',
    StreamFailed = 'stream/error',
    StreamCreated = 'stream/created',
    StreamVideoCreated = 'stream-video/started',
    StreamVideoDone = 'stream-video/done',
    StreamVideoError = 'stream-video/error',
    StreamVideoRejected = 'stream-video/rejected',
}

export enum ConnectionState {
    New,
    Fail,
    Connected,
    Connecting,
    Terminating,
}

export interface ManagerCallbacks {
    onMessage?: (event: string, data: string) => void;
    onConnectionStateChange?: (state: ConnectionState) => void;
    onVideoStateChange?: (state: StreamingState, data?: any) => void;
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
    analytics?: AnalyticsProvider;
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
    framesPerSecond: any;
}
