// Public API of @d-id/client-sdk. Everything exported here is rendered at https://sdk.d-id.com/.

// Agent Manager
export { createAgentManager } from './services/agent-manager';
export type { Auth, BasicAuth, BearerToken, ClientKeyAuth } from './types/auth';
export type { Agent, AgentAvatar, EndOfCallFeedbackConfig } from './types/entities/agents/agent';
export type {
    AgentManager,
    AgentManagerCallbacks,
    AgentManagerOptions,
    StreamOptions,
} from './types/entities/agents/manager';
export { AvatarType } from './types/entities/avatar';
export type { SttTokenResponse } from './types/voice/stt';

// Callbacks & Events
export {
    AgentActivityState,
    ConnectionState,
    ConnectivityState,
    DataChannelTopic,
    StreamEndReason,
    StreamingState,
    ToolCallEvent,
} from './types/stream/stream';
export type {
    ClientToolHandler,
    RunningToolCall,
    StreamCreatedInfo,
    ToolCallDonePayload,
    ToolCallErrorPayload,
    ToolCallStartedPayload,
    ToolEventCallback,
    ToolExecutionMode,
} from './types/stream/stream';

// Streaming Options
export type { SpeakResponse } from './types/stream/rtc';
export { StreamType } from './types/stream/stream';
export type { CompatibilityMode } from './types/stream/stream';

// Speak & Scripts
export type { AudioStreamScript, SpeakScript, TextStreamScript } from './types/stream-script';

// Chat
export { ChatMode } from './types/entities/agents/chat';
export type {
    ChatResponse,
    InterruptOptions,
    Message,
    MessagePart,
    MessageSentiment,
    Rating,
    RetrievalMetadata,
    SubmitFeedbackResponse,
} from './types/entities/agents/chat';
export { parseMessageParts } from './utils/content-parser';
export { isAwaitingTool } from './utils/tool-calls';

// Voice
export { Providers, VoiceAccess } from './types/voice/tts';
export type {
    AmazonTtsProvider,
    AzureOpenAiTtsProvider,
    ElevenlabsTtsProvider,
    MicrosoftTtsProvider,
    TtsProvider,
    Voice,
    VoiceConfigElevenlabs,
    VoiceConfigMicrosoft,
} from './types/voice/tts';

// Errors
export {
    BaseError,
    ChatCreationFailed,
    ChatModeDowngraded,
    HttpError,
    NetworkError,
    StreamError,
    ValidationError,
    WsError,
    isDIDError,
} from './errors';
export type { ErrorJson } from './errors';
