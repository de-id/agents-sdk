import { BaseError, ErrorJson } from './base-error';

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

    constructor(status: number, body: string, meta: { url?: string; method?: string } = {}) {
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
