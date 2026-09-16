import { ChatMode } from '@sdk/types';
import {
    BaseError,
    ChatCreationFailed,
    ChatModeDowngraded,
    HttpError,
    NetworkError,
    StreamError,
    ValidationError,
    WsError,
    isDIDError,
} from './index';

describe('SDK errors', () => {
    // The key invariant under an ES5 target: every error must remain catchable by type.
    describe('are catchable by type (instanceof survives throw + ES5 downleveling)', () => {
        const cases: Array<{ name: string; error: BaseError; kind: string }> = [
            { name: 'BaseError', error: new BaseError('boom'), kind: 'Error' },
            { name: 'BaseError(custom)', error: new BaseError('boom', 'CustomKind'), kind: 'CustomKind' },
            { name: 'HttpError', error: new HttpError(500, 'boom'), kind: 'HttpError' },
            { name: 'NetworkError', error: new NetworkError(new TypeError('Failed to fetch')), kind: 'NetworkError' },
            { name: 'ValidationError', error: new ValidationError('bad'), kind: 'ValidationError' },
            { name: 'WsError', error: new WsError('socket'), kind: 'WSError' },
            {
                name: 'ChatCreationFailed',
                error: new ChatCreationFailed(ChatMode.Functional, true),
                kind: 'ChatCreationFailed',
            },
            {
                name: 'ChatModeDowngraded',
                error: new ChatModeDowngraded(ChatMode.TextOnly),
                kind: 'ChatModeDowngraded',
            },
        ];

        it.each(cases)('$name should be a catchable Error + BaseError with kind "$kind"', ({ error, kind }) => {
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(BaseError);
            expect(error.kind).toBe(kind);

            try {
                throw error;
            } catch (caught) {
                expect(caught).toBeInstanceOf(BaseError);
                expect((caught as BaseError).kind).toBe(kind);
            }
        });
    });

    describe('BaseError', () => {
        it('should default kind to "Error" and carry message + cause', () => {
            expect(new BaseError('boom').kind).toBe('Error');

            const cause = new Error('root');
            const err = new BaseError('boom', 'X', cause);
            expect(err.message).toBe('boom');
            expect(err.kind).toBe('X');
            expect(err.originalError).toBe(cause);
            expect(err.toJson()).toEqual({ kind: 'X', message: 'boom', cause: 'root' });
        });

        it('should serialize the cause message only when it adds info, and never a non-Error cause', () => {
            // distinct wrapper message → the underlying browser message surfaces
            expect(
                new BaseError('Network request failed', 'NetworkError', new TypeError('Failed to fetch')).toJson()
            ).toEqual({ kind: 'NetworkError', message: 'Network request failed', cause: 'Failed to fetch' });

            // same message → no redundant cause
            expect(new BaseError('boom', 'X', new Error('boom')).toJson()).toEqual({ kind: 'X', message: 'boom' });

            // non-Error cause → omitted (never serialize arbitrary objects)
            expect(new BaseError('boom', 'X', { token: 'SECRET' }).toJson()).toEqual({ kind: 'X', message: 'boom' });
        });
    });

    describe('HttpError', () => {
        it('should parse the server { kind, description } envelope and record the call', () => {
            const body = JSON.stringify({ kind: 'InsufficientCreditsError', description: 'no credits' });
            const err = new HttpError(402, body, { endpoint: '/agents/x/chat', method: 'POST' });

            expect(err).toBeInstanceOf(HttpError);
            expect(err.kind).toBe('HttpError');
            expect(err.code).toBe('InsufficientCreditsError');
            expect(err.message).toBe('no credits');
            expect(err.status).toBe(402);
            expect(err.toJson()).toEqual({
                kind: 'HttpError',
                code: 'InsufficientCreditsError',
                message: 'no credits',
                httpStatus: 402,
                endpoint: '/agents/x/chat',
                method: 'POST',
            });
        });

        it('should fall back to code "HttpError" + raw body when the body is not the envelope', () => {
            const err = new HttpError(504, '<html>gateway timeout</html>');
            expect(err.kind).toBe('HttpError');
            expect(err.code).toBe('HttpError');
            expect(err.message).toBe('<html>gateway timeout</html>');
            expect(err.toJson()).toEqual({
                kind: 'HttpError',
                code: 'HttpError',
                message: '<html>gateway timeout</html>',
                httpStatus: 504,
            });
        });

        it('should cap the message at 256 chars when the body is huge', () => {
            expect(new HttpError(500, 'x'.repeat(1000)).message).toHaveLength(256);
        });

        it('should expose only mapped keys in toJson, never raw status/url/method', () => {
            const json = new HttpError(500, 'boom', { endpoint: '/x', method: 'GET' }).toJson();
            expect(Object.keys(json).sort()).toEqual(['code', 'endpoint', 'httpStatus', 'kind', 'message', 'method']);
            expect(json).not.toHaveProperty('status');
            expect(json).not.toHaveProperty('url');
        });

        it('should omit endpoint/method from toJson when the call context is absent', () => {
            expect(new HttpError(500, 'boom').toJson()).toEqual({
                kind: 'HttpError',
                code: 'HttpError',
                message: 'boom',
                httpStatus: 500,
            });
        });
    });

    describe('NetworkError', () => {
        it('should record the failing call (endpoint + method) and the underlying cause', () => {
            const err = new NetworkError(new TypeError('Failed to fetch'), {
                endpoint: '/agents/x/chat',
                method: 'POST',
            });

            expect(err.kind).toBe('NetworkError');
            expect(err.toJson()).toEqual({
                kind: 'NetworkError',
                message: 'Network request failed',
                cause: 'Failed to fetch',
                endpoint: '/agents/x/chat',
                method: 'POST',
            });
        });

        it('should omit endpoint/method/signals when the call context is absent', () => {
            expect(new NetworkError(new TypeError('Failed to fetch')).toJson()).toEqual({
                kind: 'NetworkError',
                message: 'Network request failed',
                cause: 'Failed to fetch',
            });
        });

        it('should serialize the captured context signals', () => {
            const err = new NetworkError(new TypeError('Load failed'), {
                endpoint: '/streams',
                method: 'POST',
                durationMs: 1234,
                online: false,
                visibility: 'hidden',
            });
            expect(err.toJson()).toEqual({
                kind: 'NetworkError',
                message: 'Network request failed',
                cause: 'Load failed',
                endpoint: '/streams',
                method: 'POST',
                durationMs: 1234,
                online: false,
                visibility: 'hidden',
            });
        });
    });

    describe('ValidationError', () => {
        it('should carry an optional key that is never serialized', () => {
            const err = new ValidationError('Message cannot be empty', 'message');
            expect(err).toBeInstanceOf(ValidationError);
            expect(err.key).toBe('message');
            expect(err.toJson()).toEqual({ kind: 'ValidationError', message: 'Message cannot be empty' });
            expect(err.toJson()).not.toHaveProperty('key');
        });
    });

    describe('WsError', () => {
        it('should use kind "WSError"', () => {
            expect(new WsError('socket died').toJson()).toEqual({ kind: 'WSError', message: 'socket died' });
        });
    });

    describe('kind is a literal on every subclass', () => {
        it('should carry its own literal at runtime', () => {
            expect(new NetworkError(new TypeError('Failed to fetch')).kind).toBe('NetworkError');
            expect(new WsError('Websocket failed to connect').kind).toBe('WSError');
            expect(new StreamError('Stream Error').kind).toBe('StreamError');
            expect(new ValidationError('bad').kind).toBe('ValidationError');
            expect(new ChatCreationFailed(ChatMode.Functional, false).kind).toBe('ChatCreationFailed');
            expect(new ChatModeDowngraded(ChatMode.TextOnly).kind).toBe('ChatModeDowngraded');
        });

        it('should narrow a union of SDK errors when the branch is on kind', () => {
            const raised: Array<StreamError | ValidationError | ChatModeDowngraded> = [
                new StreamError('Stream Error'),
                new ValidationError('Message cannot be empty', 'message'),
                new ChatModeDowngraded(ChatMode.TextOnly),
            ];
            const seen: string[] = [];

            for (const error of raised) {
                switch (error.kind) {
                    case 'ValidationError':
                        // narrowed to ValidationError: `key` exists on no other branch
                        seen.push(`ValidationError:${error.key}`);
                        break;
                    case 'ChatModeDowngraded': {
                        const kind: 'ChatModeDowngraded' = error.kind;
                        seen.push(kind);
                        break;
                    }
                    default: {
                        // the only branch left is StreamError, so its literal is assignable
                        const kind: 'StreamError' = error.kind;
                        seen.push(kind);
                    }
                }
            }

            expect(seen).toEqual(['StreamError', 'ValidationError:message', 'ChatModeDowngraded']);
        });

        it('should keep the server classification on HttpError.code, not on kind', () => {
            const body = JSON.stringify({ kind: 'InsufficientCreditsError', description: 'no credits' });
            const err = new HttpError(402, body);
            const kind: 'HttpError' = err.kind;
            const code: string = err.code;

            expect(kind).toBe('HttpError');
            expect(code).toBe('InsufficientCreditsError');
            expect(new HttpError(504, 'gateway timeout').code).toBe('HttpError');
        });

        it('should narrow a value isDIDError recognized all the way down to one class', () => {
            const raised: unknown[] = [
                new HttpError(402, JSON.stringify({ kind: 'InsufficientCreditsError', description: 'no credits' })),
                new NetworkError(new TypeError('Failed to fetch'), { endpoint: '/agents/x', method: 'GET' }),
                new StreamError('Stream Error'),
            ];
            const seen: string[] = [];

            for (const error of raised) {
                if (!isDIDError(error)) {
                    throw error;
                }

                switch (error.kind) {
                    case 'HttpError':
                        // narrowed to HttpError: `status` and `code` exist on no other branch
                        seen.push(`HttpError:${error.status}:${error.code}`);
                        break;
                    case 'NetworkError':
                        // narrowed to NetworkError: `endpoint` is typed here
                        seen.push(`NetworkError:${error.endpoint}`);
                        break;
                    case 'StreamError':
                    case 'WSError':
                    case 'ValidationError':
                    case 'ChatCreationFailed':
                    case 'ChatModeDowngraded':
                        seen.push(error.kind);
                        break;
                    default: {
                        // every member of DIDError is handled, so nothing is left
                        const exhaustive: never = error;
                        throw new Error(`unreachable: ${JSON.stringify(exhaustive)}`);
                    }
                }
            }

            expect(seen).toEqual(['HttpError:402:InsufficientCreditsError', 'NetworkError:/agents/x', 'StreamError']);
        });
    });

    describe('chat errors build descriptive messages', () => {
        it('should build a descriptive ChatCreationFailed message', () => {
            expect(new ChatCreationFailed(ChatMode.Functional, true).message).toBe(
                'Failed to create persistent chat, mode: Functional'
            );
        });

        it('should build a ChatCreationFailed message without a double space when the chat is not persistent', () => {
            expect(new ChatCreationFailed(ChatMode.Functional, false).message).toBe(
                'Failed to create chat, mode: Functional'
            );
        });

        it('should build a descriptive ChatModeDowngraded message', () => {
            expect(new ChatModeDowngraded(ChatMode.TextOnly).message).toBe('Chat mode downgraded to TextOnly');
        });
    });
});
