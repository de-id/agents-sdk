import { BaseError, ErrorJson } from './base-error';
import { RequestMeta } from './request-meta';

interface ServerErrorBody {
    kind?: string;
    description?: string;
}

// The backend serializes errors as `{ kind, description }`; parse it to reuse the server's classification.
function parseServerError(body: string): ServerErrorBody | undefined {
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object' && typeof parsed.kind === 'string') {
            return parsed as ServerErrorBody;
        }
    } catch {
        // not a JSON envelope
    }
    return undefined;
}

/**
 * A request to the Agents API came back with a non-2xx status.
 *
 * Raised for every REST call the SDK makes on the application's behalf: fetching the agent in
 * {@link createAgentManager}, creating the stream and the chat during
 * {@link AgentManager.connect | connect()}, sending a message with
 * {@link AgentManager.chat | chat()}, and the rating and feedback calls. The same error is both
 * handed to {@link AgentManagerCallbacks.onError | onError} and thrown, so it also rejects the
 * promise of whichever method made the request — catch it around that call, or handle it centrally
 * in the callback. For the message-send request behind {@link AgentManager.chat | chat()} the
 * callback may not fire; the error is still thrown. Typical cases are `401` or `403` for a client
 * key that is not authorized for the agent or the calling domain, and `404` for an unknown agent
 * id; an account that is out of credits comes back with {@link BaseError.kind | kind}
 * `'InsufficientCreditsError'`. A `429` is retried up to three times, one second apart, before it
 * surfaces.
 *
 * {@link BaseError.kind | kind} is the server's own classification when the response body is D-ID's
 * `{ kind, description }` envelope — the `'InsufficientCreditsError'` above is one — and
 * `'HttpError'` otherwise, so a message-independent branch on a specific API failure is possible.
 *
 * The message is the envelope's `description` when the body is that JSON, and the raw body
 * otherwise — truncated to 256 characters either way, because a gateway can answer a 5xx with a
 * whole HTML page.
 *
 * @category Errors
 */
export class HttpError extends BaseError {
    /**
     * HTTP status code of the response, such as `401`, `404` or `500`.
     */
    readonly status: number;
    /**
     * Path of the request that failed, relative to the API client's base path — for example
     * `/agt_x/chat/cht_y` for a message sent to a chat.
     *
     * Absent when the error was constructed without call context.
     */
    readonly url?: string;
    /**
     * HTTP method of the request that failed, such as `GET` or `POST`.
     *
     * Absent when the error was constructed without call context.
     */
    readonly method?: string;

    /**
     * Builds the error from the failing response.
     * @internal The SDK builds this itself; applications catch the error rather than construct it.
     */
    constructor(status: number, body: string, meta: RequestMeta = {}) {
        const parsed = parseServerError(body);
        // Cap the body — a non-JSON 5xx (e.g. a gateway's HTML page) is the only unbounded message source.
        super((parsed?.description ?? body).slice(0, 256), parsed?.kind ?? 'HttpError');

        this.status = status;
        this.url = meta.url;
        this.method = meta.method;
    }

    /**
     * Serializes the error, adding the failing call to what
     * {@link BaseError.toJson | BaseError.toJson()} already returns.
     *
     * Adds `httpStatus` from {@link HttpError.status | status}, and `endpoint` and `method` when the
     * call context is known. The raw `status` and `url` property names are not part of the payload.
     *
     * @returns The error as plain, JSON-serializable data.
     */
    toJson(): ErrorJson {
        return {
            ...super.toJson(),
            httpStatus: this.status,
            ...(this.url ? { endpoint: this.url } : {}),
            ...(this.method ? { method: this.method } : {}),
        };
    }
}
