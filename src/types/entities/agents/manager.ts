import { SupportedStreamScipt } from '$/types/StreamScript';
import { Auth } from '../../auth';
import { SendStreamPayloadResponse, StreamingState } from '../../stream';
import { Agent } from './agent';
import { ChatResponse, Message, RatingEntity, RatingPayload } from './chat';

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

export type ChatProgressCallback = (progress: ChatProgress, data: string) => void;
export type ConnectionStateChangeCallback = (state: RTCIceConnectionState) => void;
export type VideoStateChangeCallback = (state: StreamingState, data: any) => void;

interface ManagerCallbacks {
    /**
     * Optional callback will be triggered each time the RTC connection changes state
     * @param state
     */
    onConnectionStateChange?(state: RTCIceConnectionState): void;
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
     * Optional callback function that will be triggered each time any changes happen in the chat
     * @param progress
     */
    onChatEvents?(progress: ChatProgress, data: any): void;

    /**
     * Optional callback function that will be triggered when the agent is ready
     * @param agent - Agent instance you are working with
     */
    onAgentReady?(agent: Agent): void;
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
     * Unique ID of agent user used in analitics. Pass it to override the default way to get distinctId
     */
    distinctId?: string;
}

export interface AgentManager {
    /**
     * Agent instance you are working with.
     * To know more about agents go to https://docs.d-id.com/reference/agents
     */
    agent: Agent;
    /**
     * Method to be reconnected to chat
     * Since chat uses an RTC connection to communicate with the agent, it could be dropped and to continue to chat you need to reconnect
     */
    reconnectToChat: () => Promise<void>;
    /**
     * Method to close all connections with agent, stream and web socket
     */
    terminate: () => Promise<void>;
    /**
     * ID of chat you are working on now
     */
    chatId: string;
    /**
     * Method to send a chat message to existing chat with the agent
     * @param messages
     */
    chat: (messages: Message[]) => Promise<ChatResponse>;
    /**
     * Method to rate the answer in chat
     * @param payload
     * @param id - id of Rating entity. Leave it empty to create a new, one or pass it to work with the existing one
     */
    rate: (payload: RatingPayload, id?: string) => Promise<RatingEntity>;
    /**
     * Method to delete rating from answer in chat
     * @param id - id of Rating entity.
     */
    deleteRate:(id: string) => Promise<RatingEntity>;
    /**
     * Method to make your agent read the text you provide or reproduce sound
     * @param payload
     */
    speak: (payload: SupportedStreamScipt) => Promise<SendStreamPayloadResponse>;
    /**
     * Optional callback function that will be triggered each time any changes happen in the chat
     * @param callback
     */
    getStarterMessages: () => Promise<string[]>;
    /**
     * TODO describe event and props from MixPanel Docs
     * TODO add response
     * @param event 
     * @param props 
     * @returns 
     */
    track: (event: string, props?: Record<string, any>) => Promise<any>;
}
