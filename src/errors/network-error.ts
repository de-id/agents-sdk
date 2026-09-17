import { BaseError, ErrorJson } from './base-error';

import { RequestMeta } from './request-meta';

/**
 * A request to the Agents API never reached the server, so no response came back.
 *
 * This is the transport failure counterpart of {@link HttpError}, where the server did answer: the
 * browser's `fetch` rejected outright because the device is offline, DNS or TLS failed, the
 * connection was refused or the request was blocked, for instance by CORS or an extension. Like
 * {@link HttpError} it is both handed to {@link AgentManagerCallbacks.onError | onError} and
 * thrown, so it also rejects the promise of the method that made the request; for the message-send
 * request behind {@link AgentManager.chat | chat()} the callback may not fire, but the error is
 * still thrown. A request the SDK cancelled itself is not reported this way — the browser's own
 * `AbortError` is rethrown unchanged.
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
     * Always `'NetworkError'`. Branch on it to tell this failure from the other SDK errors.
     */
    readonly kind: 'NetworkError' = 'NetworkError';

    /**
     * Path of the request that failed, relative to the API client's base path — for example
     * `/agt_x/chat/cht_y`.
     */
    readonly endpoint?: string;
    /**
     * HTTP method of the request that failed, such as `GET` or `POST`.
     */
    readonly method?: string;
    /**
     * How long the request ran before it failed, in milliseconds.
     *
     * A value close to zero usually means the request never left the browser; a large one points
     * at a connection that was established and then lost.
     */
    readonly durationMs?: number;
    /**
     * The browser's `navigator.onLine` at the moment of the failure — `false` when the device
     * reported itself offline.
     */
    readonly online?: boolean;
    /**
     * The page's `document.visibilityState` at the moment of the failure.
     *
     * `'hidden'` means the tab was in the background, where browsers throttle or suspend network
     * activity.
     */
    readonly visibility?: DocumentVisibilityState;

    /**
     * Wraps a rejected `fetch` together with what was known about the call.
     * @internal The SDK builds this itself; applications catch the error rather than construct it.
     */
    constructor(originalError?: unknown, meta: RequestMeta = {}) {
        super('Network request failed', 'NetworkError', originalError);
        this.endpoint = meta.endpoint;
        this.method = meta.method;
        this.durationMs = meta.durationMs;
        this.online = meta.online;
        this.visibility = meta.visibility;
    }

    /**
     * Serializes the error, adding the captured context to what
     * {@link BaseError.toJson | BaseError.toJson()} already returns.
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
