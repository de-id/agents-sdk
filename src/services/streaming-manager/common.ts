import { CreateStreamOptions } from '$/types';

export const createStreamingLogger = (debug: boolean, prefix: string) => (message: string, extra?: any) =>
    debug && console.log(`[${prefix}] ${message}`, extra ?? '');

/**
 * Shared type for all streaming managers (LiveKit, WebRTC, etc.)
 * This type represents the return value of any streaming manager implementation
 */
export type StreamingManager<T extends CreateStreamOptions> = {
    /**
     * Method to send request to server to get clip or talk depending on payload
     * @param payload The payload to send to the streaming service
     */
    speak(payload: any): Promise<any>;

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
    streamType: any;

    /**
     * Whether interrupt functionality is available for this stream
     */
    interruptAvailable: boolean;
};
