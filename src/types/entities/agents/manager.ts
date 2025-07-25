import { STTTokenResponse } from '$/types';
import { Auth } from '$/types/auth';
import {
    AgentActivityState,
    CompatibilityMode,
    ConnectionState,
    ConnectivityState,
    SendStreamPayloadResponse,
    StreamEvents,
    StreamType,
    StreamingState,
} from '$/types/stream';
import { SupportedStreamScript } from '$/types/stream-script';
import { Agent } from './agent';
import { ChatMode, ChatResponse, Interrupt, Message, RatingEntity } from './chat';

/**
 * Types of events provided in Chat Progress Callback
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
     * Chat was closed
     */
    Complete = 'done',
}

export type ChatProgressCallback = (progress: ChatProgress | StreamEvents, data: any) => void;
export type ConnectionStateChangeCallback = (state: ConnectionState) => void;
export type VideoStateChangeCallback = (state: StreamingState, data: any) => void;

interface ManagerCallbacks {
    /**
     * Optional callback will be triggered each time the RTC connection changes state
     * @param state
     */
    onConnectionStateChange?(state: ConnectionState): void;
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
     */
    onError?: (error: Error, errorData?: object) => void;

    /**
     * Optional callback function that will be triggered each time the agent activity state changes
     * @param state - AgentActivityState
     */
    onAgentActivityStateChange?(state: AgentActivityState): void;
}

interface StreamOptions {
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
    callbacks: ManagerCallbacks;
    mode: ChatMode;
    baseURL?: string;
    wsURL?: string;
    debug?: boolean;
    enableAnalitics?: boolean;
    mixpanelKey?: string;
    /**
     * Unique ID of agent user used in analytics. Pass it to override the default way to get distinctId
     */
    distinctId?: string;
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
    getStreamType: () => StreamType | undefined;

    /**
     * Get if the stream supports interrupt
     */
    getIsInterruptAvailable: () => boolean;

    /**
     * Array of starter messages that will be sent to the agent when the chat starts
     */
    starterMessages: string[];
    /**
     * Get a token for the Speech to Text service
     * Only available after a chat has started and the agent has been connected
     */
    getSTTToken: () => Promise<STTTokenResponse | undefined>;
    /**
     * Method to connect to stream and chat
     */
    connect: () => Promise<void>;
    /**
     * Method to reconnect to stream and continue chat
     */
    reconnect: () => Promise<void>;
    /**
     * Method to close all connections with agent, stream and web socket
     */
    disconnect: () => Promise<void>;
    /**
     * Method to send a chat message to existing chat with the agent
     * @param messages
     */
    chat: (userMessage: string) => Promise<ChatResponse>;
    /**
     * Method to rate the answer in chat
     * @param score: 1 | -1 - score of the answer. 1 for positive, -1 for negative
     * @param matches - array of matches that were used to find the answer
     * @param id - id of Rating entity. Leave it empty to create a new, one or pass it to work with the existing one
     */
    rate: (messageId: string, score: 1 | -1, rateId?: string) => Promise<RatingEntity>;
    /**
     * Method to delete rating from answer in chat
     * @param id - id of Rating entity.
     */
    deleteRate: (id: string) => Promise<RatingEntity>;
    /**
     * Method to make your agent read the text you provide or reproduce sound
     * @param payload
     */
    speak: (payload: SupportedStreamScript | string) => Promise<SendStreamPayloadResponse>;
    /**
     * Method to change the mode of the chat
     * @param mode - ChatMode
     */
    changeMode(mode: ChatMode): void;

    /**
     * Method to enrich analytics properties
     * @param properties flat json object with properties that will be added to analytics events fired from the sdk
     */
    enrichAnalytics: (properties: Record<string, any>) => void;

    /**
     * Method to interrupt the current video stream
     * Only available for Fluent streams and when there's an active video to interrupt
     */
    interrupt: (interrupt: Interrupt) => void;
}
