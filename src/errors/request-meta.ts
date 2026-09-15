/**
 * Request context recorded on an error: what was requested, how long it took and what the tab
 * could see of the network at the time. Shared by `HttpError` and `NetworkError`.
 * @internal Implementation type; not part of the public SDK surface.
 */
export interface RequestMeta {
    url?: string;
    method?: string;
    durationMs?: number;
    online?: boolean;
    visibility?: DocumentVisibilityState;
}
