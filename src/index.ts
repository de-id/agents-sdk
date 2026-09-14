// src/index.ts
// Public surface of @d-id/client-sdk. Everything listed here is documented at https://sdk.d-id.com/.
// Adding a name here is an API change: give it a JSDoc block and an @category tag (see typedoc.config.mjs).

// Agent Manager
export { createAgentManager } from './services/agent-manager';
export type { Auth, BasicAuth, BearerToken, ClientKeyAuth, GetAuthParams } from './types/auth';
export type { Agent, EndOfCallFeedbackConfig } from './types/entities/agents/agent';
export type {
    AgentManager,
    AgentManagerCallbacks,
    AgentManagerOptions,
    ConnectionStateChangeCallback,
    StreamOptions,
    VideoStateChangeCallback,
} from './types/entities/agents/manager';
export type { STTTokenResponse } from './types/voice/stt';
export { SDK_VERSION } from './version';

// Callbacks & Events
export {
    AgentActivityState,
    ConnectionState,
    ConnectivityState,
    PublicDataChannelTopic,
    StreamEndReason,
    StreamEvents,
    StreamingState,
} from './types/stream/stream';
export type {
    ClientToolHandler,
    RunningToolCall,
    ToolCallDonePayload,
    ToolCallErrorPayload,
    ToolCallStartedPayload,
    ToolEventCallback,
    ToolEventPayload,
    ToolExecutionMode,
} from './types/stream/stream';

// Streaming Options
export { VideoType, mapVideoType } from './types/entities/video';
export type { SendStreamPayloadResponse, Status, StickyRequest } from './types/stream/rtc';
export { StreamType } from './types/stream/stream';
export type { CompatibilityMode } from './types/stream/stream';

// Speak & Scripts
export type {
    BaseStreamScript,
    StreamScriptType,
    Stream_Audio_Script,
    Stream_Text_Script,
    SupportedStreamScript,
} from './types/stream-script';

// Chat
export { ChatMode, RateState } from './types/entities/agents/chat';
export type {
    Chat,
    ChatResponse,
    IRetrivalMetadata,
    Interrupt,
    Message,
    MessagePart,
    RatingEntity,
    SubmitFeedbackResponse,
} from './types/entities/agents/chat';
export { parseMessageParts } from './utils/content-parser';
export { isAwaitingTool } from './utils/tool-calls';

// Voice
export { Providers, VoiceAccess } from './types/voice/tts';
export type {
    Afflorithmics_tts_provider,
    Amazon_tts_provider,
    AzureOpenAi_tts_provider,
    Elevenlabs_tts_provider,
    ExtendedTextToSpeechProviders,
    IVoice,
    Microsoft_tts_provider,
    StreamTextToSpeechProviders,
    TextToSpeechProviders,
    VoiceConfigAfflorithmics,
    VoiceConfigElevenlabs,
    VoiceConfigMicrosoft,
} from './types/voice/tts';

// Errors
export * from './errors';

// Leaked implementation types, kept exported for backwards compatibility only.
// Hidden from the reference (@internal) and deprecated; deleted in the next major.
export * from './types/internal';
