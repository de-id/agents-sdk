import { BaseError } from './base-error';

/**
 * A method was called with arguments, or in a state, that the SDK will not send to the API.
 *
 * This is one of the two SDK errors that are only ever thrown to the caller and never delivered to
 * {@link AgentManagerCallbacks.onError | onError} (the other is {@link ChatCreationFailed}): it is
 * the direct answer to the call you just made, so catch it around that call. The SDK raises it from
 * {@link AgentManager.chat | chat()} when the message is empty or 2000 characters or longer, when
 * the session's {@link ChatMode} has chat disabled or is in maintenance, and when the chat or the
 * stream has not been initialized yet; from {@link AgentManager.speak | speak()} when it is called
 * before {@link AgentManager.connect | connect()}; and from
 * {@link AgentManager.rate | rate()}, {@link AgentManager.deleteRate | deleteRate()} and
 * {@link AgentManager.submitFeedback | submitFeedback()} when no chat has started, plus, for
 * `rate()` alone, when no message with the given id is in the transcript.
 *
 * Nothing was sent to the API when this is raised, so the session stays usable: fix the argument or
 * wait for {@link ConnectionState.Connected | 'connected'} and call again.
 * {@link BaseError.kind | kind} is `'ValidationError'`.
 *
 * @category Errors
 */
export class ValidationError extends BaseError {
    /**
     * Builds a validation failure. The SDK does this itself before it performs a request.
     *
     * @param message - What was wrong with the call, such as `'Message cannot be empty'`.
     * @param key - Name of the field the failure is about. The SDK's own validations leave it
     * unset.
     */
    constructor(
        message: string,
        /**
         * Name of the field the failure is about.
         *
         * The SDK does not populate it — every validation it raises passes the message alone — so it
         * is only set on a `ValidationError` an application constructed itself. It is also left out
         * of {@link BaseError.toJson | toJson()}, so a serialized validation error carries only its
         * kind and message.
         */
        public readonly key?: string
    ) {
        super(message, 'ValidationError');
    }
}
