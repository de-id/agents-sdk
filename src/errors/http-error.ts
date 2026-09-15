import { BaseError, ErrorJson } from './base-error';
import { RequestMeta } from './network-error';

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

export class HttpError extends BaseError {
    readonly status: number;
    readonly url?: string;
    readonly method?: string;

    /**
     * Wraps a non-2xx response, reusing the server's own `kind` and `description` when it sent them.
     *
     * The SDK constructs `HttpError` itself; applications receive instances through `onError`
     * and rejected promises rather than calling this.
     *
     * @param status - HTTP status code of the response.
     * @param body - Raw response body; a `{ kind, description }` envelope is parsed out of it.
     * @param meta - Request context captured when the call was made.
     * @internal Constructed by the SDK; not part of the public SDK surface.
     */
    constructor(status: number, body: string, meta: RequestMeta = {}) {
        const parsed = parseServerError(body);
        // Cap the body — a non-JSON 5xx (e.g. a gateway's HTML page) is the only unbounded message source.
        super((parsed?.description ?? body).slice(0, 256), parsed?.kind ?? 'HttpError');

        this.status = status;
        this.url = meta.url;
        this.method = meta.method;
    }

    toJson(): ErrorJson {
        return {
            ...super.toJson(),
            httpStatus: this.status,
            ...(this.url ? { endpoint: this.url } : {}),
            ...(this.method ? { method: this.method } : {}),
        };
    }
}
