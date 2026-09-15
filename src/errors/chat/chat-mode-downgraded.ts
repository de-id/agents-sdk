import { ChatMode } from '@sdk/types';
import { BaseError } from '../base-error';

/**
 * The server put the session into a different chat mode from the one that was requested, and the
 * new mode cannot stream video.
 *
 * Raised while {@link AgentManager.connect | connect()} runs, when the chat the server created came
 * back in a mode other than the requested {@link AgentManagerOptions.mode | mode} and that mode is
 * not {@link ChatMode.Functional | Functional} — {@link ChatMode.TextOnly | TextOnly} or
 * {@link ChatMode.Maintenance | Maintenance}, for instance. The comparison only runs when `mode` was
 * set in the options, so a session that never asked for a mode never sees this error. The SDK
 * disconnects the stream it had just opened and `connect()` resolves anyway, so no video will play
 * and {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady} will not fire again: the
 * session continues as a text chat.
 *
 * It is delivered to {@link AgentManagerCallbacks.onError | onError} and never thrown, so
 * `connect()` does not reject on it.
 * {@link AgentManagerCallbacks.onModeChange | onModeChange} fires with the new mode just before it.
 * Treat it as a signal to switch the interface to text, not as a connection failure.
 * {@link BaseError.kind | kind} is `'ChatModeDowngraded'`.
 *
 * @category Errors
 */
export class ChatModeDowngraded extends BaseError {
    /**
     * Builds the error from the mode the session ended up in. The SDK does this itself.
     *
     * @param mode - The {@link ChatMode} the server assigned, which is also the mode reported by
     * {@link AgentManagerCallbacks.onModeChange | onModeChange}.
     */
    constructor(mode: ChatMode) {
        super(`Chat mode downgraded to ${mode}`, 'ChatModeDowngraded');
    }
}
