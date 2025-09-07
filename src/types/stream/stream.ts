import { Analytics } from '$/services/analytics/mixpanel';
import { VideoRTCStatsReport } from '$/services/streaming-manager/stats/report';
import { Auth } from '../auth';
import { CreateClipStreamRequest, CreateTalkStreamRequest, SendClipStreamPayload, SendTalkStreamPayload } from './api';
import { ICreateStreamRequestResponse, IceCandidate, SendStreamPayloadResponse, Status } from './rtc';

export type CompatibilityMode = 'on' | 'off' | 'auto';

export enum StreamingState {
    Start = 'START',
    Stop = 'STOP',
}

export enum ConnectivityState {
    Strong = 'STRONG',
    Weak = 'WEAK',
    Unknown = 'UNKNOWN',
}

export enum AgentActivityState {
    Idle = 'IDLE',
    Talking = 'TALKING',
}

export enum StreamEvents {
    ChatAnswer = 'chat/answer',
    ChatPartial = 'chat/partial',
    StreamDone = 'stream/done',
    StreamStarted = 'stream/started',
    StreamFailed = 'stream/error',
    StreamReady = 'stream/ready',
    StreamCreated = 'stream/created',
    StreamInterrupt = 'stream/interrupt',
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

export enum StreamType {
    Legacy = 'legacy',
    Fluent = 'fluent',
    LiveKit = 'livekit',
}

export interface ManagerCallbacks {
    onMessage?: (event: string, data: string) => void;
    onConnectionStateChange?: (state: ConnectionState) => void;
    onVideoStateChange?: (state: StreamingState, report?: VideoRTCStatsReport) => void;
    onSrcObjectReady?: (value: MediaStream) => void;
    onError?: (error: Error, errorData: object) => void;
    onConnectivityStateChange?: (state: ConnectivityState) => void;
    onAgentActivityStateChange?: (state: AgentActivityState) => void;
    onVideoIdChange?: (videoId: string | null) => void;
    onStreamCreated?: (stream: { stream_id: string; session_id: string; agent_id: string }) => void;
}

export type ManagerCallbackKeys = keyof ManagerCallbacks;
export interface TalkStreamOptions extends CreateTalkStreamRequest {
    fluent?: boolean;
}

export interface ClipStreamOptions extends CreateClipStreamRequest {
    fluent?: boolean;
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
    analytics: Analytics;
}

export interface SlimRTCStatsReport {
    index: number;
    codec: string;
    rtt: number;
    duration?: number;
    bitrate?: number;
    timestamp: any;
    bytesReceived: any;
    packetsReceived: any;
    packetsLost: any;
    framesDropped: any;
    framesDecoded: any;
    jitter: any;
    jitterBufferDelay: number;
    jitterBufferEmittedCount: number;
    avgJitterDelayInInterval: number;
    frameWidth: any;
    frameHeight: any;
    framesPerSecond: any;
    freezeCount: number;
    freezeDuration: number;
}

export interface AnalyticsRTCStatsReport {
    timestamp?: number;
    duration: number;
    bytesReceived: number;
    bitrate: number;
    packetsReceived: number;
    packetsLost: number;
    framesDropped: number;
    framesDecoded: number;
    jitter: number;
    jitterBufferDelay: number;
    jitterBufferEmittedCount: number;
    avgJitterDelayInInterval: number;
    framesPerSecond: number;
    freezeCount: number;
    freezeDuration: number;
    lowFpsCount?: number;
    causes?: string[];
}

export interface StreamInterruptPayload {
    type: StreamEvents.StreamInterrupt;
    videoId: string;
    timestamp: number;
}
