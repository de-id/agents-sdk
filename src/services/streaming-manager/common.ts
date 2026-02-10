import { CreateSessionV2Options, CreateStreamOptions, PayloadType, StreamType } from '@sdk/types';

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
     * Mute the currently published microphone stream
     * Fast operation that keeps the track published but stops sending audio
     * supported only for livekit manager
     */
    muteMicrophoneStream?(): Promise<void>;

    /**
     * Unmute the currently published microphone stream
     * Fast operation that resumes sending audio on the published track
     * supported only for livekit manager
     */
    unmuteMicrophoneStream?(): Promise<void>;

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
     * Whether triggers functionality is available for this stream
     */
    triggersAvailable: boolean;
};
