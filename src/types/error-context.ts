/**
 * What the SDK knows about where a failure happened, beyond the error itself.
 *
 * The second argument of {@link AgentManagerCallbacks.onError | onError}. Which fields are set
 * follows from the call that failed, not from the class of the error:
 *
 * - a failed Agents API request — an {@link HttpError} or a {@link NetworkError} — sets
 *   {@link ErrorContext.endpoint | endpoint} and {@link ErrorContext.method | method};
 * - a failure on an Expressive (V4) session sets {@link ErrorContext.sessionId | sessionId};
 * - a failure on a Talks (V2) or Clips (V3) stream sets {@link ErrorContext.streamId | streamId}.
 *
 * Nothing else is passed. In particular the request body and headers are not: the body is the end
 * user's own message, and applications routinely forward this argument straight to an error
 * reporter. The error is the thing to log — {@link BaseError.toJson | toJson()} renders it with
 * the same request fields already redacted — and this is context to attach alongside it.
 *
 * Every field is optional, so read them with a guard; a failure the SDK has no context for is
 * reported with an empty object.
 *
 * @category Callbacks & Events
 */
export interface ErrorContext {
    /**
     * Path of the Agents API request that failed, relative to the API host.
     *
     * The same value as {@link HttpError.endpoint} and {@link NetworkError.endpoint} on the error
     * itself.
     */
    endpoint?: string;
    /** HTTP method of the request that failed, such as `GET` or `POST`. */
    method?: string;
    /**
     * Id of the Expressive (V4) session the failure happened on.
     *
     * The same value {@link AgentManagerCallbacks.onStreamCreated | onStreamCreated} reported as
     * {@link StreamCreatedInfo.sessionId}, and {@link AgentManager.getSessionInfo | getSessionInfo()}
     * returns.
     */
    sessionId?: string;
    /**
     * Id of the Talks (V2) or Clips (V3) stream the failure happened on.
     *
     * The same value {@link AgentManagerCallbacks.onStreamCreated | onStreamCreated} reported as
     * {@link StreamCreatedInfo.streamId}.
     */
    streamId?: string;
}
