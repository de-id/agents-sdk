import { SupportedStreamScipt } from '$/types/StreamScript';
import { Auth } from '../../auth';
import { ConnectionState, SendStreamPayloadResponse, StreamingState } from '../../stream';
import { Agent } from './agent';
import { ChatMode, ChatResponse, Message, RatingEntity } from './chat';

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

export type ChatProgressCallback = (progress: ChatProgress, data: any) => void;
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
    onVideoStateChange?(state: StreamingState, data?: any): void;
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
    onNewMessage?(messages: Message[]): void;
    /**
     * Optional callback function that will be triggered each time new chat is created
     * @param chatId - id of the new chat
     */
    onNewChat?(chatId: string): void;
}

export interface AgentManagerOptions {
    auth: Auth;
    callbacks: ManagerCallbacks;
    baseURL?: string;
    wsURL?: string;
    debug?: boolean;
    enableAnalitics?: boolean;
    mixpanelKey?: string;
    /**
     * Unique ID of agent user used in analytics. Pass it to override the default way to get distinctId
     */
    distinctId?: string;
    mode?: ChatMode;
}

export interface AgentManager {
    /**
     * Agent instance you are working with.
     * To know more about agents go to https://docs.d-id.com/reference/agents
     */
    agent: Agent;
    /**
     * Array of starter messages that will be sent to the agent when the chat starts
     */
    starterMessages: string[];
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
     * @param append_chat: when true, append to existing agent chat, rather than creating a new one.
     */
    chat: (userMessage: string, append_chat?: boolean) => Promise<ChatResponse>;
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
    speak: (payload: SupportedStreamScipt) => Promise<SendStreamPayloadResponse>;

    /**
     * Method to change the mode of the chat
     * @param mode - ChatMode
     */
    changeMode(mode: ChatMode): void;
}
