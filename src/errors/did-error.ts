import type { ChatCreationFailed } from './chat/chat-creation-failed';
import type { ChatModeDowngraded } from './chat/chat-mode-downgraded';
import type { HttpError } from './http-error';
import type { NetworkError } from './network-error';
import type { StreamError } from './stream-error';
import type { ValidationError } from './validation-error';
import type { WsError } from './ws-error';

/**
 * Every error the SDK raises, as a union — what {@link isDIDError} narrows a caught value to.
 *
 * Each member declares {@link BaseError.kind | kind} as a different literal, so a `switch` on
 * `kind` inside an `isDIDError` branch narrows the value to one class and gives typed access to
 * that class's own fields — {@link HttpError.status | status} and {@link HttpError.code | code} on
 * an {@link HttpError}, {@link ValidationError.key | key} on a {@link ValidationError}, and so on.
 * The `default` branch of an exhaustive `switch` is `never` to the type checker.
 *
 * Keep that branch total anyway. {@link isDIDError} recognizes any `Error` carrying a string
 * `kind`, which is what lets it see across a bundle boundary, so a value built by a different copy
 * of the SDK — a 2.x `HttpError`, whose `kind` was the server's classification — can reach the
 * `default` branch at runtime with a `kind` outside this union.
 *
 * {@link BaseError} itself is deliberately not a member: its `kind` is a plain `string`, which
 * matches every literal and would stop the narrowing from working.
 *
 * @example Branching on a caught error
 * ```ts
 * import { isDIDError, type DIDError } from '@d-id/client-sdk';
 *
 * try {
 *     await agentManager.connect();
 * } catch (error) {
 *     if (!isDIDError(error)) {
 *         throw error;
 *     }
 *
 *     switch (error.kind) {
 *         case 'HttpError':
 *             console.error(error.status, error.code);
 *             break;
 *         case 'NetworkError':
 *             console.error('offline?', error.endpoint);
 *             break;
 *         default:
 *             // Total on purpose: `kind` is `never` here to the type checker, but a value from
 *             // another copy of the SDK can still land in this branch.
 *             console.error(error.kind, error.message);
 *     }
 * }
 * ```
 * @category Errors
 */
export type DIDError =
    | HttpError
    | NetworkError
    | StreamError
    | WsError
    | ValidationError
    | ChatCreationFailed
    | ChatModeDowngraded;
