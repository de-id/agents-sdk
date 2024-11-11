import { Analytics } from '$/services/mixpanel';
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
    StreamFailed = 'stream/error',
    StreamReady = 'stream/ready',
    StreamCreated = 'stream/created',
    StreamVideoCreated = 'stream-video/started',
    StreamVideoDone = 'stream-video/done',
    StreamVideoError = 'stream-video/error',
    StreamVideoRejected = 'stream-video/rejected',
}

export enum ConnectionState {
    New = 'new',
    Fail = 'fail',
    Connected = 'connected',
    Connecting = 'connecting',
    Closed = 'closed',
    Completed = 'completed',
    Disconnected = 'disconnected',
}

export interface ManagerCallbacks {
    onMessage?: (event: string, data: string) => void;
    onConnectionStateChange?: (state: ConnectionState) => void;
    onVideoStateChange?: (state: StreamingState) => void;
    onSrcObjectReady?: (value: MediaStream) => void;
    onError?: (error: Error, errorData: object) => void;
}

export type ManagerCallbackKeys = keyof ManagerCallbacks;
export interface TalkStreamOptions extends CreateTalkStreamRequest {
    videoType: VideoType.Talk;
    stream_greeting?: string;
}

export interface ClipStreamOptions extends CreateClipStreamRequest {
    videoType: VideoType.Clip;
    stream_greeting?: string;
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
    warmup?: boolean;
    auth: Auth;
    analytics: Analytics;
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
