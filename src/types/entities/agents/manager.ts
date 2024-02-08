import { SupportedStreamScipt } from '$/types/StreamScript';
import { Auth } from '../../auth';
import { SendStreamPayloadResponse, StreamingState } from '../../stream';
import { Agent } from './agent';
import { ChatResponse, Message, RatingEntity, RatingPayload } from './chat';

/**
 * Types of events provided in Chat Progress Callback
 */
enum ChatProgress {
    /**
     * Chat was successfully embedded
     */
    Embed,
    /**
     * Server processing chat message
     */
    Query,
    /**
     * Server processed message and returned response
     */
    Answer,
    /**
     * Chat was closed
     */
    Complete,
}

export type ChatProgressCallback = (progress: ChatProgress) => void;
export type ConnectionStateChangeCallback = (state: RTCIceConnectionState) => void;
export type VideoStateChangeCallback = (state: StreamingState) => void

interface ManagerCallbacks {
    /**
     * This callback will be triggered each time the RTC connection changes state
     * @param state
     */
    onConnectionStateChange?(state: RTCIceConnectionState): void;
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
     * Optional callback function that will be triggered each time any changes happen in the chat
     * @param progress
     */
    onChatEvents?(progress: ChatProgress): void;
}

export interface AgentManagerOptions {
    callbacks: ManagerCallbacks;
    baseURL?: string;
    debug?: boolean;
    auth: Auth;
}

export interface AgentsManager {
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
     * This method provides you the possibility to rate your chat experience
     * TODO asks Sagi how it's work
     * @param payload
     * @param id - id of Rating entity. Leave it empty to create a new, one or pass it to work with the existing one
     */
    rate: (payload: RatingPayload, id?: string) => Promise<RatingEntity>;
    /**
     * Method to make your agent read the text you provide or reproduce sound
     * @param payload
     */
    speak: (payload: SupportedStreamScipt) => Promise<SendStreamPayloadResponse>;
    /**
     * Optional callback function that will be triggered each time any changes happen in the chat
     * @param callback
     */
    onChatEvents: (callback: ChatProgressCallback) => void;
    /**
     * Optional callback function that will be triggered each time the RTC connection gets new status
     * @param callback
     */
    onConnectionEvents: (callback: ConnectionStateChangeCallback) => void;
    /**
     * Optional callback function that will be triggered each time video events happen
     * @param callback
     */
    onVideoEvents: (callback: VideoStateChangeCallback) => void;
};
