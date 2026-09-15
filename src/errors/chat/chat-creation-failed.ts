import { ChatMode } from '@sdk/types';
import { BaseError } from '../base-error';

/**
 * A chat could not be created for the session.
 *
 * {@link AgentManager.chat | chat()} creates a chat on the first message when the session does not
 * have one yet; this error is thrown when that call comes back without one, so it rejects the
 * promise `chat()` returned and the user's message is not sent. It is not delivered to
 * {@link AgentManagerCallbacks.onError | onError} — catch it around `chat()`. A failing request
 * surfaces as {@link HttpError} or {@link NetworkError} instead; this error is the case where the
 * request succeeded but produced no chat.
 *
 * The message names the {@link ChatMode} in effect and whether a persistent chat was asked for, for
 * example `Failed to create persistent chat, mode: Functional`.
 * {@link BaseError.kind | kind} is `'ChatCreationFailed'`.
 *
 * @category Errors
 */
export class ChatCreationFailed extends BaseError {
    /**
     * Builds the error from the attempt that failed. The SDK does this itself.
     *
     * @param mode - The {@link ChatMode} the chat was being created in.
     * @param persistent - Whether a persistent chat was requested, from
     * {@link AgentManagerOptions.persistentChat | persistentChat}.
     */
    constructor(mode: ChatMode, persistent: boolean) {
        super(`Failed to create ${persistent ? 'persistent' : ''} chat, mode: ${mode}`, 'ChatCreationFailed');
    }
}
