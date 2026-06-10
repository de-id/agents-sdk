export interface ErrorJson {
    kind: string;
    message: string;
    cause?: string;
    [key: string]: any;
}

export class BaseError extends Error {
    constructor(
        message: string,
        public readonly kind: string = 'Error',
        public readonly originalError?: unknown
    ) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }

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

export function isDIDError(error: unknown): error is BaseError {
    return error instanceof Error && typeof (error as { kind?: unknown }).kind === 'string';
}
