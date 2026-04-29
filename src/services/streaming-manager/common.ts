import { CreateSessionV2Options, CreateStreamOptions, Interrupt, PayloadType, StreamType } from '@sdk/types';

export const createStreamingLogger = (debug: boolean, prefix: string) => (message: string, extra?: any) =>
    debug && console.log(`[${prefix}] ${message}`, extra ?? '');

/**
 * Shared type for all streaming managers (LiveKit, WebRTC, etc.)
 * This type represents the return value of any streaming manager implementation
 */
export type StreamingManager<T extends CreateStreamOptions | CreateSessionV2Options> = {
    /**
     * Method to send request to server to get clip or talk depending on payload
     * @param payload The payload to send to the streaming service
     */
    speak(payload: PayloadType<T>): Promise<any>;

    /**
     * Method to close the streaming connection
     */
    disconnect(): Promise<void>;

    /**
     * Method to send data channel messages to the server
     * @param payload The message payload to send
     */
    sendDataChannelMessage(payload: string): void;

    /**
     * Method to send text messages to the server
     * @param payload The message payload to send
     * supported only for livekit manager
     */
    sendTextMessage?(payload: string): Promise<void>;

    /**
     * Publish a microphone stream to the DataChannel
     * Can be called after connection to add microphone input
     * @param stream The MediaStream containing the microphone audio track
     * supported only for livekit manager
     */
    publishMicrophoneStream?(stream: MediaStream): Promise<void>;

    /**
     * Unpublish the currently published microphone stream
     * Can be called after connection to remove microphone input
     * supported only for livekit manager
     */
    unpublishMicrophoneStream?(): Promise<void>;

    /**
     * Publish a camera video stream to the LiveKit room.
     * Can be called after connection to enable vision.
     * supported only for livekit manager
     */
    publishCameraStream?(stream: MediaStream): Promise<void>;

    /**
     * Unpublish the currently published camera stream.
     * Can be called after connection to disable vision.
     * supported only for livekit manager
     */
    unpublishCameraStream?(): Promise<void>;

    /**
     * Session identifier information, should be returned in the body of all streaming requests
     */
    sessionId: string;

    /**
     * Id of current streaming session
     */
    streamId: string;

    /**
     * Type of streaming implementation being used
     */
    streamType: StreamType;

    /**
     * Whether interrupt functionality is available for this stream
     */
    interruptAvailable: boolean;

    /**
     * Whether the current stream segment can be interrupted by the user
     */
    isInterruptible: boolean;

    /**
     * Send an interrupt for the current stream segment.
     * Each implementation owns the validation/transport details (e.g. V1
     * sends a `stream/interrupt` payload over the data channel; V2 sends
     * `did.interrupt` and ignores `text` interrupts to avoid races).
     */
    interrupt(type: Interrupt['type']): void;

    /**
     * Register an RPC method handler on the LiveKit room.
     * Used internally by the agent-manager for client tool delegation.
     * supported only for livekit manager
     */
    registerRpcMethod?(method: string, handler: (data: any) => Promise<string>): void;

    /**
     * Unregister a previously registered RPC method.
     * supported only for livekit manager
     */
    unregisterRpcMethod?(method: string): void;
};
