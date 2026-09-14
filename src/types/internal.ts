// src/types/internal.ts
// Implementation types that were exported from the package root before the API reference existed.
// They stay exported so nothing breaks, are tagged @internal (hidden from the docs) and @deprecated
// (editor warning). DELETE THIS FILE in the next major version.

export type { AgentManagerItems } from '../services/agent-manager';
export type { AgentsAPI } from './entities/agents/agent';
export type { ChatPayload, RatingPayload } from './entities/agents/chat';
export { ChatProgress } from './entities/agents/manager';
export type { ChatProgressCallback } from './entities/agents/manager';
export { DocumentType, KnowledgeType, Subject } from './entities/knowledge';
export type {
    CreateDocumentPayload,
    CreateRecordPayload,
    DocumentData,
    DocumentStatus,
    IParserResult,
    KnowledgeData,
    KnowledgePayload,
    QueryResult,
    RecordData,
} from './entities/knowledge';
export type { StreamScript, Stream_LLM_Script } from './stream-script';
export type {
    CreateClipStreamRequest,
    CreateTalkStreamRequest,
    SendClipStreamPayload,
    SendTalkStreamPayload,
} from './stream/api';
export type { ICreateStreamRequestResponse, IceCandidate, IceServer } from './stream/rtc';
export type {
    AnalyticsRTCStatsReport,
    AudioDetectionMetrics,
    AvSyncReport,
    AvSyncSample,
    ClipStreamOptions,
    CreateStreamOptions,
    ManagerCallbackKeys,
    ManagerCallbacks,
    PayloadType,
    RpcMethodHandler,
    RtcApi,
    SlimRTCStatsReport,
    StreamEndUserData,
    StreamInterruptPayload,
    StreamingManagerCallbacks,
    StreamingManagerOptions,
    TalkStreamOptions,
    TurnEventPayload,
} from './stream/stream';
export { TransportProvider } from './stream/streams-v2';
export type { CreateSessionV2Options, CreateSessionV2Response } from './stream/streams-v2';
