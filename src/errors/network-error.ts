import { BaseError, ErrorJson } from './base-error';

/**
 * Context captured about the request that failed, recorded on a {@link NetworkError}.
 *
 * Everything is optional: the SDK fills in what the browser can tell it at the moment of the
 * failure, and each field it has is copied into {@link NetworkError.toJson | toJson()}.
 *
 * @category Errors
 */
import { RequestMeta } from './request-meta';
/**
 * Path of the request that failed, relative to the API host — for example `/agents/agt_x/chat`.
 * Recorded as `endpoint`.
 */
/**
 * HTTP method of the request that failed, such as `GET` or `POST`.
 */
/**
 * How long the request ran before it failed, in milliseconds.
 *
 * A value close to zero usually means the request never left the browser; a large one points at
 * a connection that was established and then lost.
 */
/**
 * The browser's `navigator.onLine` at the moment of the failure — `false` when the device
 * reported itself offline.
 */
/**
 * The page's `document.visibilityState` at the moment of the failure.
 *
 * `'hidden'` means the tab was in the background, where browsers throttle or suspend network
 * activity.
 */

/**
 * A request to the D-ID API never reached the server, so no response came back.
 *
 * This is the transport failure counterpart of {@link HttpError}, where the server did answer: the
 * browser's `fetch` rejected outright because the device is offline, DNS or TLS failed, the
 * connection was refused or the request was blocked, for instance by CORS or an extension. Like
 * {@link HttpError} it is both handed to {@link AgentManagerCallbacks.onError | onError} and
 * thrown, so it also rejects the promise of the method that made the request. A request the SDK
 * cancelled itself is not reported this way — the browser's own `AbortError` is rethrown unchanged.
 *
 * The message is always `'Network request failed'`; the browser's own wording, such as
 * `'Failed to fetch'`, is kept in {@link BaseError.originalError | originalError} and appears as
 * `cause` in {@link NetworkError.toJson | toJson()}. The remaining properties record what was
 * happening at the time, which is usually what distinguishes a dropped connection from a tab that
 * was backgrounded.
 *
 * @category Errors
 */
export class NetworkError extends BaseError {
    /**
     * Path of the request that failed, relative to the API host. Taken from
     * {@link NetworkErrorMeta.url | meta.url}.
     */
    readonly endpoint?: string;
    /**
     * HTTP method of the request that failed, such as `GET` or `POST`.
     */
    readonly method?: string;
    /**
     * How long the request ran before it failed, in milliseconds.
     */
    readonly durationMs?: number;
    /**
     * The browser's `navigator.onLine` at the moment of the failure.
     */
    readonly online?: boolean;
    /**
     * The page's `document.visibilityState` at the moment of the failure.
     */
    readonly visibility?: DocumentVisibilityState;

    /**
     * Wraps a rejected `fetch` together with what was known about the call. The SDK builds this
     * itself.
     *
     * @param originalError - The browser's own rejection, kept as
     * {@link BaseError.originalError | originalError}.
     * @param meta - Context about the failing request. See {@link NetworkErrorMeta}.
     */
    constructor(originalError?: unknown, meta: RequestMeta = {}) {
        super('Network request failed', 'NetworkError', originalError);
        // Naming drift kept on purpose: `HttpError` exposes the same value as `url`, and both
        // serialize it as `endpoint` in toJson(). Renaming either property is a breaking change.
        this.endpoint = meta.url;
        this.method = meta.method;
        this.durationMs = meta.durationMs;
        this.online = meta.online;
        this.visibility = meta.visibility;
    }

    /**
     * Serializes the error, adding the captured context to what
     * {@link BaseError.toJson | toJson()} already returns.
     *
     * Each of `endpoint`, `method`, `durationMs`, `online` and `visibility` is included only when it
     * was captured.
     *
     * @returns The error as plain, JSON-serializable data.
     */
    toJson(): ErrorJson {
        return {
            ...super.toJson(),
            ...(this.endpoint ? { endpoint: this.endpoint } : {}),
            ...(this.method ? { method: this.method } : {}),
            ...(this.durationMs !== undefined ? { durationMs: this.durationMs } : {}),
            ...(this.online !== undefined ? { online: this.online } : {}),
            ...(this.visibility ? { visibility: this.visibility } : {}),
        };
    }
}
