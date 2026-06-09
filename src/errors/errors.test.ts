import { ChatMode } from '@sdk/types';
import {
    ApplicationError,
    BaseError,
    ChatCreationFailed,
    ChatModeDowngraded,
    HttpError,
    ValidationError,
    WsError,
} from './index';

describe('SDK errors', () => {
    // The key invariant under an ES5 target: every error must remain catchable by type.
    describe('are catchable by type (instanceof survives throw + ES5 downleveling)', () => {
        const cases: Array<{ name: string; error: BaseError; kind: string }> = [
            { name: 'BaseError', error: new BaseError('boom'), kind: 'Error' },
            { name: 'BaseError(custom)', error: new BaseError('boom', 'CustomKind'), kind: 'CustomKind' },
            { name: 'HttpError', error: new HttpError(500, 'boom'), kind: 'HttpError' },
            { name: 'ValidationError', error: new ValidationError('bad'), kind: 'ValidationError' },
            { name: 'WsError', error: new WsError('socket'), kind: 'WSError' },
            { name: 'ApplicationError', error: new ApplicationError('oops'), kind: 'ApplicationError' },
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
            expect(err.toJson()).toEqual({ kind: 'X', error: 'boom', cause: 'root' });
        });

        it('should serialize the cause message only when it adds info, and never a non-Error cause', () => {
            // distinct wrapper message → the underlying browser message surfaces
            expect(
                new BaseError('Network request failed', 'NetworkError', new TypeError('Failed to fetch')).toJson()
            ).toEqual({ kind: 'NetworkError', error: 'Network request failed', cause: 'Failed to fetch' });

            // same message → no redundant cause
            expect(new BaseError('boom', 'X', new Error('boom')).toJson()).toEqual({ kind: 'X', error: 'boom' });

            // non-Error cause → omitted (never serialize arbitrary objects)
            expect(new BaseError('boom', 'X', { token: 'SECRET' }).toJson()).toEqual({ kind: 'X', error: 'boom' });
        });
    });

    describe('HttpError', () => {
        it('should parse the server { kind, description } envelope and record the call', () => {
            const body = JSON.stringify({ kind: 'InsufficientCreditsError', description: 'no credits' });
            const err = new HttpError(402, body, { url: '/agents/x/chat', method: 'POST' });

            expect(err).toBeInstanceOf(HttpError);
            expect(err.kind).toBe('InsufficientCreditsError');
            expect(err.message).toBe('no credits');
            expect(err.status).toBe(402);
            expect(err.toJson()).toEqual({
                kind: 'InsufficientCreditsError',
                error: 'no credits',
                httpStatus: 402,
                endpoint: '/agents/x/chat',
                method: 'POST',
            });
        });

        it('should fall back to kind "HttpError" + raw body when the body is not the envelope', () => {
            const err = new HttpError(504, '<html>gateway timeout</html>');
            expect(err.kind).toBe('HttpError');
            expect(err.message).toBe('<html>gateway timeout</html>');
            expect(err.toJson()).toEqual({
                kind: 'HttpError',
                error: '<html>gateway timeout</html>',
                httpStatus: 504,
            });
        });

        it('should cap the message at 256 chars when the body is huge', () => {
            expect(new HttpError(500, 'x'.repeat(1000)).message).toHaveLength(256);
        });

        it('should expose only mapped keys in toJson, never raw status/url/method', () => {
            const json = new HttpError(500, 'boom', { url: '/x', method: 'GET' }).toJson();
            expect(Object.keys(json).sort()).toEqual(['endpoint', 'error', 'httpStatus', 'kind', 'method']);
            expect(json).not.toHaveProperty('status');
            expect(json).not.toHaveProperty('url');
        });

        it('should omit endpoint/method from toJson when the call context is absent', () => {
            expect(new HttpError(500, 'boom').toJson()).toEqual({
                kind: 'HttpError',
                error: 'boom',
                httpStatus: 500,
            });
        });
    });

    describe('ValidationError', () => {
        it('should carry an optional key that is never serialized', () => {
            const err = new ValidationError('Message cannot be empty', 'message');
            expect(err).toBeInstanceOf(ValidationError);
            expect(err.key).toBe('message');
            expect(err.toJson()).toEqual({ kind: 'ValidationError', error: 'Message cannot be empty' });
            expect(err.toJson()).not.toHaveProperty('key');
        });
    });

    describe('WsError', () => {
        it('should use kind "WSError"', () => {
            expect(new WsError('socket died').toJson()).toEqual({ kind: 'WSError', error: 'socket died' });
        });
    });

    describe('ApplicationError', () => {
        it('should use kind "ApplicationError" and surface the cause message but never the cause object', () => {
            const cause = new Error('root');
            const err = new ApplicationError('wrapped', cause);
            expect(err).toBeInstanceOf(ApplicationError);
            expect(err.originalError).toBe(cause);
            expect(err.toJson()).toEqual({ kind: 'ApplicationError', error: 'wrapped', cause: 'root' });
            expect(err.toJson()).not.toHaveProperty('originalError');
        });
    });

    describe('chat errors build descriptive messages', () => {
        it('should build a descriptive ChatCreationFailed message', () => {
            expect(new ChatCreationFailed(ChatMode.Functional, true).message).toBe(
                'Failed to create persistent chat, mode: Functional'
            );
        });

        it('should build a descriptive ChatModeDowngraded message', () => {
            expect(new ChatModeDowngraded(ChatMode.TextOnly).message).toBe('Chat mode downgraded to TextOnly');
        });
    });
});
