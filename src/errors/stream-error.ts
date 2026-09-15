import { BaseError } from './base-error';

/**
 * Something went wrong inside the live audio and video stream.
 *
 * Unlike {@link HttpError} and {@link NetworkError}, which come from REST calls, this one comes
 * from the transport carrying the agent's video, so it is only ever delivered to
 * {@link AgentManagerCallbacks.onError | onError} — no call of yours is necessarily in flight when
 * it happens, and nothing throws it. The SDK raises it when:
 *
 * - no media track is subscribed within the timeout after the LiveKit room used by Expressive (V4)
 *   agents connects, after which the SDK disconnects the stream;
 * - the LiveKit room reports a media-device or encryption failure;
 * - a message cannot be put on the data channel — the WebRTC channel used by Talks (V2) and Clips
 *   (V3) is not open, or the LiveKit room is not connected or rejects the send;
 * - the server reports that the stream itself failed, with the message
 *   `Stream failed with event <event>`.
 *
 * Most of these leave the session unusable, so the useful response is to tell the user and call
 * {@link AgentManager.reconnect | reconnect()}. {@link BaseError.kind | kind} is `'StreamError'`.
 * The message describes the failure, and is the plain `'Stream Error'` when the transport gave no
 * detail; the underlying error, where there was one, is kept as
 * {@link BaseError.originalError | originalError}.
 *
 * @category Errors
 */
export class StreamError extends BaseError {
    /**
     * Wraps a streaming failure.
     * @internal The SDK builds this itself; applications catch the error rather than construct it.
     */
    constructor(message: string, originalError?: unknown) {
        super(message, 'StreamError', originalError);
    }
}
