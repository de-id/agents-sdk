export class SdkError extends Error {
    constructor({ kind, description }: { kind: string; description?: string; }) {
        const message = JSON.stringify({ kind, description });
        super(message);
    }
}
