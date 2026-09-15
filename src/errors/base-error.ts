/**
 * The JSON-safe payload {@link BaseError.toJson | toJson()} produces, for logs and error reports.
 *
 * Only the fields the SDK deliberately exposes are present, so the payload can be forwarded to a
 * logging service as it is. Subclasses add their own keys: {@link HttpError} adds `httpStatus` and,
 * when the failing call is known, `endpoint` and `method`; {@link NetworkError} adds `endpoint`,
 * `method`, `durationMs`, `online` and `visibility`.
 *
 * @category Errors
 */
export interface ErrorJson {
    /**
     * Stable machine-readable code for the failure — the error's {@link BaseError.kind | kind}.
     */
    kind: string;
    /**
     * Human-readable description of the failure — the error's `message`.
     */
    message: string;
    /**
     * Message of the error that caused this one, truncated to 256 characters.
     *
     * Present only when {@link BaseError.originalError | originalError} is an `Error` and its
     * message differs from {@link ErrorJson.message | message}. A cause that is not an `Error` is
     * never serialized, so an arbitrary object carrying credentials cannot end up in the payload.
     */
    cause?: string;
    /**
     * Additional fields contributed by a subclass, such as `httpStatus` on {@link HttpError}.
     */
    [key: string]: any;
}

/**
 * Base class of every error the SDK itself raises.
 *
 * Catching `BaseError` catches everything the SDK classified; branch on
 * {@link BaseError.kind | kind}, which is stable, rather than on the message, which is not.
 * Errors reach the application two ways, and each subclass says which applies: some are thrown to
 * the caller of the method, so they reject the promise it returned; others are handed to
 * {@link AgentManagerCallbacks.onError | onError} because no call of yours was in flight when they
 * happened. {@link HttpError} and {@link NetworkError} do both — the request that failed rejects,
 * and the callback is notified as well.
 *
 * Not everything that reaches the application is one of these. The streaming transport is the main
 * exception: a failure LiveKit raises inside a media call on an Expressive (V4) agent — no
 * microphone publication to replace, a room that is not connected — rejects with a plain `Error`,
 * and so do a few low-level guards inside {@link AgentManager.connect | connect()}, such as a
 * `livekit-client` package that is not installed, a transport the SDK does not recognise, or a
 * stream the server created without a session id. An unknown
 * {@link AgentManagerOptions.auth | auth} type is a plain `Error` too. So keep the
 * `else throw error` branch in a handler built on {@link isDIDError}.
 *
 * Subclasses: {@link HttpError}, {@link NetworkError}, {@link WsError}, {@link StreamError},
 * {@link ValidationError}, {@link ChatCreationFailed} and {@link ChatModeDowngraded}. When the
 * caught value is typed `unknown`, {@link isDIDError} narrows it to this class.
 *
 * @category Errors
 */
export class BaseError extends Error {
    /**
     * Creates an SDK error. The SDK builds these itself; applications normally only catch them.
     *
     * @param message - Human-readable description of the failure, used as the `Error` message.
     * @param kind - Stable machine-readable code for the failure.
     * @param originalError - The underlying error or value this one wraps, when there is one.
     */
    constructor(
        message: string,
        /**
         * Stable machine-readable code for this failure, and the value to branch on.
         *
         * Every subclass redeclares it as the literal it always carries, so a `switch` on `kind`
         * narrows the caught error to that class: `'NetworkError'` on {@link NetworkError},
         * `'WSError'` on {@link WsError}, `'StreamError'` on {@link StreamError},
         * `'ValidationError'` on {@link ValidationError}, `'ChatCreationFailed'` on
         * {@link ChatCreationFailed} and `'ChatModeDowngraded'` on {@link ChatModeDowngraded}.
         * {@link HttpError} is the one that stays a plain `string`, because it reuses the server's
         * own classification when the response carries one and is `'HttpError'` otherwise. On a
         * `BaseError` built directly it is whatever the caller passed, and `'Error'` when nothing
         * was.
         */
        public readonly kind: string = 'Error',
        /**
         * The error or value that caused this one, when the SDK was wrapping something else.
         *
         * For a {@link NetworkError} this is the browser's own `fetch` rejection. It is not
         * serialized as-is: {@link BaseError.toJson | toJson()} takes only an `Error` cause's
         * message.
         */
        public readonly originalError?: unknown
    ) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }

    /**
     * Serializes the error into the JSON-safe {@link ErrorJson} payload for logging or reporting.
     *
     * The payload always carries {@link BaseError.kind | kind} and the message. The cause's message
     * is added only when {@link BaseError.originalError | originalError} is an `Error` and says
     * something the message does not, truncated to 256 characters; any other cause is dropped.
     * Subclasses extend the payload with the fields listed on their own pages.
     *
     * @returns The error as plain, JSON-serializable data.
     * @example An HttpError from a request that was refused
     * ```json
     * {
     *     "kind": "InsufficientCreditsError",
     *     "message": "Account has insufficient credits",
     *     "httpStatus": 402,
     *     "endpoint": "/agt_x/chat/cht_y",
     *     "method": "POST"
     * }
     * ```
     * @example A NetworkError from a request that never left the browser
     * ```json
     * {
     *     "kind": "NetworkError",
     *     "message": "Network request failed",
     *     "cause": "Failed to fetch",
     *     "endpoint": "/agt_x/chat/cht_y",
     *     "method": "POST",
     *     "durationMs": 12,
     *     "online": false,
     *     "visibility": "visible"
     * }
     * ```
     */
    toJson(): ErrorJson {
        // the cause's message — Error causes only, and only when it adds to ours (payload is public)
        const cause = this.originalError instanceof Error ? this.originalError.message.slice(0, 256) : undefined;
        return {
            kind: this.kind,
            message: this.message,
            ...(cause && cause !== this.message ? { cause } : {}),
        };
    }
}

/**
 * Type guard that reports whether a caught value is an error raised by the SDK.
 *
 * It accepts any `Error` carrying a string `kind`, which every {@link BaseError} has, so it also
 * recognizes SDK errors that crossed a bundle boundary, where `instanceof BaseError` can fail
 * because two copies of the class are loaded. Narrowing with it gives typed access to
 * {@link BaseError.kind | kind}, {@link BaseError.originalError | originalError} and
 * {@link BaseError.toJson | toJson()}.
 *
 * @param error - The caught value to test.
 * @returns `true` when `error` is a {@link BaseError}.
 * @example
 * ```ts
 * try {
 *     await agentManager.chat('What is the distance to the moon?');
 * } catch (error) {
 *     if (isDIDError(error)) {
 *         console.error(error.kind, error.toJson());
 *     } else {
 *         throw error;
 *     }
 * }
 * ```
 * @category Errors
 */
export function isDIDError(error: unknown): error is BaseError {
    return error instanceof Error && typeof (error as { kind?: unknown }).kind === 'string';
}
