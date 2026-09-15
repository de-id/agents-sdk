import { STTTokenResponse } from '@sdk/types';
import { Auth } from '@sdk/types/auth';
import {
    AgentActivityState,
    ClientToolHandler,
    CompatibilityMode,
    ConnectionState,
    ConnectivityState,
    PublicDataChannelTopic,
    SendStreamPayloadResponse,
    StreamCreatedInfo,
    StreamEvents,
    StreamType,
    StreamingState,
} from '@sdk/types/stream';
import { SupportedStreamScript } from '@sdk/types/stream-script';
import type { StreamingManagerCallbacks as StreamManagerCallbacks } from '../../stream/stream';
import { Agent } from './agent';
import { ChatMode, ChatResponse, Interrupt, Message, RatingEntity, SubmitFeedbackResponse } from './chat';

/**
 * Types of events provided in Chat Progress Callback
 * @internal Implementation type; not part of the public SDK surface.
 */
export enum ChatProgress {
    /**
     * Chat was successfully embedded
     */
    Embed = 'embed',
    /**
     * Server processing chat message
     */
    Query = 'query',
    /**
     * Server returns a part of the message
     */
    Partial = 'partial',
    /**
     * Server processed message and returned response
     */
    Answer = 'answer',
    /**
     * Audio-transcribed user message
     */
    Transcribe = 'transcribe',
    /**
     * Chat was closed
     */
    Complete = 'done',
}

/**
 * Callback signature for {@link ChatProgress} events emitted internally during a chat exchange.
 * @internal Implementation type; not part of the public SDK surface.
 */
export type ChatProgressCallback = (progress: ChatProgress | StreamEvents, data: any) => void;

export interface AgentManagerCallbacks {
    /**
     * Optional callback will be triggered each time the RTC connection changes state
     * @param state
     * @param reason - a `StreamEndReason` when the server ended the stream, otherwise a diagnostic string
     */
    onConnectionStateChange?(state: ConnectionState, reason?: string): void;
    /**
     * Optional callback function that will be triggered each time video events happen
     * @param state
     */
    onVideoStateChange?(state: StreamingState): void;
    /**
     * Callback function that will be triggered each time the video stream starts or stops to update html element on webpage
     * Required callback for SDK
     * @param srcObject
     * @example
     * const videoRef = useRef<HTMLVideoElement>(null);
     * onSrcObjectReady(value) { videoRef.current.srcObject = value }
     */
    onSrcObjectReady(srcObject: MediaStream): void;
    /**
     * Optional callback function that will be triggered each time new message is received
     * @param messages - array of messages
     */
    onNewMessage?(messages: Message[], type: 'answer' | 'partial' | 'user'): void;
    /**
     * Optional callback function that will be triggered each time new chat is created
     * @param chatId - id of the new chat
     */
    onNewChat?(chatId: string): void;
    /**
     * Optional callback function that will be triggered each time the chat mode changes
     * @param mode - ChatMode
     */
    onModeChange?(mode: ChatMode): void;
    /**
     * Optional callback function that will be triggered each time the user internet connectivity state change by realtime estimated bitrate
     * @param state - ConnectivityState
     */
    onConnectivityStateChange?(state: ConnectivityState): void;
    /**
     * Optional callback function that will be triggered on fetch request errors
     * @param error - the error the SDK raised; narrow it with `isDIDError`
     * @param errorData - context for this failure; the keys depend on which error it is
     * (`url`, `options` and sometimes `headers` for a failed request, `sessionId` or `streamId` for
     * a stream failure, `data` for a stream event)
     */
    onError?: (error: Error, errorData?: Record<string, unknown>) => void;
    /**
     * Optional callback function that will be triggered each time the agent activity state changes
     * @param state - AgentActivityState
     */
    onAgentActivityStateChange?(state: AgentActivityState): void;
    /**
     * Optional callback function that will be triggered each time a new stream is created
     * @param stream - the stream's agent_id, session_id and stream_id
     */
    onStreamCreated?: (stream: StreamCreatedInfo) => void;
    /**
     * Optional callback function that will be triggered when tool-call events occur during the call
     * (tool-call/started, tool-call/done, tool-call/error).
     * The payload shape is discriminated by the event argument.
     */
    onToolEvent?: StreamManagerCallbacks['onToolEvent'];
    /**
     * Optional callback function that will be triggered when the interruptible state changes
     * @param interruptible - Whether the agent can be interrupted by the user
     */
    onInterruptibleChange?: StreamManagerCallbacks['onInterruptibleChange'];
    /**
     * Optional callback function that will be triggered when the set of running tool calls changes,
     * including an empty array on disconnect.
     * @param calls - The tool calls currently running
     */
    onRunningToolCallsChange?: StreamManagerCallbacks['onRunningToolCallsChange'];
}

export interface StreamOptions {
    /**
     * Defines the video codec to be used in the stream.
     * When set to on: VP8 will be used.
     * When set to off: H264 will be used
     * When set to auto the codec will be selected according to the browser.
     * @default auto
     */
    compatibilityMode?: CompatibilityMode;

    /**
     * Whether to stream wamrup video on the connection.
     * If set to true, will stream a warmup video when connection is established.
     * At the end of the warmup video, a message containing "stream/ready" will be sent on the data channel.
     * @default false
     */
    streamWarmup?: boolean;

    /**
     * Maximum duration (in seconds) between messages before session times out.
     * Can only be used with proper permissions
     * @maximum 300
     * @example 180
     */
    sessionTimeout?: number;

    /**
     * Desired stream resolution for the session
     * @minimum 150
     * @maximum 1080
     */
    outputResolution?: number;

    /**
     * Whether to request fluent stream.
     * @default false
     */
    fluent?: boolean;
}

export interface AgentManagerOptions {
    auth: Auth;
    callbacks: AgentManagerCallbacks;
    mode?: ChatMode;
    baseURL?: string;
    wsURL?: string;
    debug?: boolean;
    verbose?: boolean;
    /**
     * Whether to enable analytics (Mixpanel) tracking.
     * @default true
     */
    enableAnalytics?: boolean;
    mixpanelKey?: string;
    mixpanelAdditionalProperties?: Record<string, unknown>;
    externalId?: string;
    streamOptions?: StreamOptions;
    initialMessages?: Message[];
    persistentChat?: boolean;
}

export interface AgentManager {
    /**
     * Agent instance you are working with.
     * To know more about agents go to https://docs.d-id.com/reference/agents
     */
    agent: Agent;
    /**
     * Get the current stream type of the agent
     */
    getStreamType(): StreamType | undefined;

    /**
     * Get if the stream supports interrupt
     */
    getIsInterruptAvailable(): boolean;

    /**
     * Array of starter messages that will be sent to the agent when the chat starts
     */
    starterMessages: string[];
    /**
     * Get a token for the Speech to Text service
     * Only available after a chat has started and the agent has been connected
     */
    getSTTToken(): Promise<STTTokenResponse | undefined>;
    /**
     * Method to connect to stream and chat
     */
    connect(): Promise<void>;
    /**
     * Method to reconnect to stream and continue chat
     */
    reconnect(): Promise<void>;
    /**
     * Method to close all connections with agent, stream and web socket
     */
    disconnect(): Promise<void>;
    /**
     * Publish a microphone stream to the data channel
     * Can be called after connection to add microphone input
     * @param stream The MediaStream containing the microphone audio track
     * Expressive (V4) agents only; on Talks (V2) and Clips (V3) agents the returned promise rejects.
     */
    publishMicrophoneStream(stream: MediaStream): Promise<void>;
    /**
     * Unpublish the currently published microphone stream
     * Can be called after connection to remove microphone input
     * Expressive (V4) agents only; on Talks (V2) and Clips (V3) agents it resolves without doing anything.
     */
    unpublishMicrophoneStream(): Promise<void>;
    /**
     * Replace the live microphone track on the current publication without
     * unpublishing. Preserves the LiveKit publication (SSRC, trackSid) so the
     * server sees continuous audio across mic device swaps. Resolves once
     * LiveKit has switched the underlying RTCRtpSender's track.
     * Rejects if there is no active publication — callers should fall back to
     * `publishMicrophoneStream` in that case.
     * Expressive (V4) agents only; on Talks (V2) and Clips (V3) agents the returned promise rejects.
     */
    replaceMicrophoneTrack(track: MediaStreamTrack): Promise<void>;
    /**
     * Publish a camera video stream to the LiveKit room.
     * Can be called after connection to enable vision.
     * Expressive (V4) agents only; on Talks (V2) and Clips (V3) agents the returned promise rejects.
     */
    publishCameraStream(stream: MediaStream): Promise<void>;
    /**
     * Unpublish the currently published camera stream.
     * Can be called after connection to disable vision.
     * Expressive (V4) agents only; on Talks (V2) and Clips (V3) agents it resolves without doing anything.
     */
    unpublishCameraStream(): Promise<void>;
    /**
     * Method to send a chat message to existing chat with the agent
     * @param userMessage - The user's message text to send to the agent.
     */
    chat(userMessage: string): Promise<ChatResponse>;
    /**
     * Method to rate the answer in chat
     * @param messageId - Id of the message being rated.
     * @param score - 1 for a positive rating, -1 for a negative one.
     * @param rateId - Id of an existing rating to update; omit to create a new one.
     */
    rate(messageId: string, score: 1 | -1, rateId?: string): Promise<RatingEntity>;
    /**
     * Method to delete rating from answer in chat
     * @param id - id of Rating entity.
     */
    deleteRate(id: string): Promise<RatingEntity>;
    /**
     * Method to submit end-of-call feedback for the chat
     * @param rating - integer score from 1 to 5
     * @param answer - optional free-text answer
     */
    submitFeedback(rating: number, answer?: string): Promise<SubmitFeedbackResponse>;
    /**
     * Method to make your agent read the text you provide or reproduce sound
     * @param payload
     */
    speak(payload: SupportedStreamScript | string): Promise<SendStreamPayloadResponse>;
    /**
     * Method to change the mode of the chat
     * @param mode - ChatMode
     */
    changeMode(mode: ChatMode): void;

    /**
     * Method to enrich analytics properties
     * @param properties flat json object with properties that will be added to analytics events fired from the sdk
     */
    enrichAnalytics(properties: Record<string, unknown>): void;

    /**
     * Method to interrupt the current video stream
     * Only available for Fluent streams and when there's an active video to interrupt
     */
    interrupt(interrupt: Interrupt): void;

    /**
     * Switch the STT language mid-session
     * Only available for Expressive (V4) agents
     * @param language - Language name or BCP-47 code (e.g. "English" or "en-US")
     */
    setSttLanguage(language: string): Promise<void>;

    /**
     * Send a JSON payload to the agent over a data-channel topic
     * Only available for Expressive (V4) agents
     * @param topic - Data-channel topic to send on (see `PublicDataChannelTopic`)
     * @param payload - Plain object, serialized as JSON
     */
    sendDataChannelMessage(topic: PublicDataChannelTopic, payload: Record<string, unknown>): Promise<void>;

    /**
     * Register a handler for a client tool. When the agent's LLM calls this tool,
     * the handler executes on the client and returns the result to the LLM.
     * @param name - Tool name (must match the tool name defined in the agent config)
     * @param handler - Async function receiving args, must return a JSON string (max 15KiB)
     */
    registerClientTool(name: string, handler: ClientToolHandler): void;

    /**
     * Remove a previously registered client tool handler.
     * @param name - Tool name to unregister
     */
    unregisterClientTool(name: string): void;
}
