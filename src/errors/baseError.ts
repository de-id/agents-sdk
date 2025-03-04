interface BaseErrorParams {
    kind: string;
    description?: string;
    error?: Error;
}

export class BaseError extends Error {
    kind: string;
    description?: string;
    error?: Error;

    constructor({ kind, description, error }: BaseErrorParams) {
        super(JSON.stringify({ kind, description }));

        this.kind = kind;
        this.description = description;
        this.error = error;
    }
}
