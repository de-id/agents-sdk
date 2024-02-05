import { SupportedStreamScipt } from '$/types/StreamScript';
import { Auth } from '../../auth';
import { SendStreamPayloadResponse, StreamingState } from '../../stream';
import { Agent } from './agent';
import { ChatResponse, Message, RatingEntity, RatingPayload } from './chat';

enum ChatProgress {
    Embed,
    Query,
    Answer,
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
     * Callback function that will be triggered each time the video stream starts or stop
     * @param srcObject
     */
    onSrcObjectReady?(srcObject: MediaStream): void;
    /**
     * Optional callback function that will be triggered each time any changes happen in the chat
     * @param progress
     */
    onChatEvents?(progress: ChatProgress): void;
}

export interface AgentManagerOptions {
    callbacks?: ManagerCallbacks;
    baseURL?: string;
    debug?: boolean;
    auth: Auth;
}

export interface AgentAPI {
    /**
     * Agent instance you are working with
     * to know more about agents go to https://docs.d-id.com/reference/agents
     */
    agent: Agent;
    /**
     * Method to be reconnected to chat
     * Since chat uses an RTC connection to communicate with the agent, it could be dropped and to continue chat you need to reconnect
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
     * Method to make you passed
     * @param payload
     */
    speak: (payload: SupportedStreamScipt) => Promise<SendStreamPayloadResponse>;
    /**
     * Optional callback function that will be triggered each time any changes happen in the chat
     * @param callback
     */
    onChatEvents: (progress: ChatProgress) => void;
    /**
     * Optional callback function that will be triggered each time the RTC connection gets new status
     * @param callback
     */
    onConnectionEvents: (state: RTCIceConnectionState) => void;
    /**
     * Optional callback function that will be triggered each time video events happen
     * @param callback
     */
    onVideoEvents: (state: StreamingState) => void;
}
