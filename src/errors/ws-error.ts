import { BaseError } from './base-error';

/**
 * The web socket the SDK uses for chat notifications failed to connect.
 *
 * Talks (V2) and Clips (V3) sessions open a web socket alongside the video stream; the agent's
 * answer arrives over it as `partial` and `answer` events, which is what drives
 * {@link AgentManagerCallbacks.onNewMessage | onNewMessage}. This error is raised when that socket
 * emits an `error` event, once per failed attempt while
 * {@link AgentManager.connect | connect()} is retrying. It is only delivered to
 * {@link AgentManagerCallbacks.onError | onError} and never thrown, so there is nothing to catch
 * around `connect()` for it; if every attempt fails, `connect()` rejects with the browser's own
 * socket event instead.
 *
 * Expressive (V4) agents do not open this socket — they receive the same events over the LiveKit
 * data channel — so the error cannot occur for them.
 *
 * {@link BaseError.kind | kind} is `'WSError'`.
 *
 * @category Errors
 */
export class WsError extends BaseError {
    /**
     * Wraps a web socket failure. The SDK builds this itself from the socket's `error` event.
     *
     * @param message - Description of the failure; the socket manager reports
     * `'Websocket failed to connect'`.
     */
    constructor(message: string) {
        super(message, 'WSError');
    }
}
