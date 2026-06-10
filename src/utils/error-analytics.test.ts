import { BaseError, HttpError, ValidationError, WsError } from '../errors';
import { toErrorAnalytics } from './error-analytics';

const ALLOWED_KEYS = ['kind', 'error', 'cause', 'httpStatus', 'endpoint', 'method'];

describe('toErrorAnalytics', () => {
    it("should delegate to an SDK error's own toJson()", () => {
        const err = new HttpError(
            402,
            JSON.stringify({ kind: 'InsufficientCreditsError', description: 'no credits' }),
            { url: '/agents/x/chat', method: 'POST' }
        );
        expect(toErrorAnalytics(err)).toEqual(err.toJson());
        expect(toErrorAnalytics(err)).toEqual({
            kind: 'InsufficientCreditsError',
            error: 'no credits',
            httpStatus: 402,
            endpoint: '/agents/x/chat',
            method: 'POST',
        });
    });

    it('should classify every SDK error by its kind', () => {
        expect(toErrorAnalytics(new HttpError(500, 'boom'))).toMatchObject({
            kind: 'HttpError',
            httpStatus: 500,
        });
        expect(toErrorAnalytics(new ValidationError('bad'))).toMatchObject({ kind: 'ValidationError', error: 'bad' });
        expect(toErrorAnalytics(new WsError('socket'))).toMatchObject({ kind: 'WSError' });
        expect(toErrorAnalytics(new BaseError('Network request failed', 'NetworkError'))).toEqual({
            kind: 'NetworkError',
            error: 'Network request failed',
        });
        expect(toErrorAnalytics(new BaseError('downgraded', 'ChatModeDowngraded'))).toMatchObject({
            kind: 'ChatModeDowngraded',
        });
    });

    describe('unknown / non-SDK throwables map to kind "UnknownError"', () => {
        it.each([
            ['an Error', new Error('something weird'), 'something weird'],
            ['a string', 'plain string', 'plain string'],
            ['a number', 42, '42'],
            ['null', null, 'UnknownError'],
            ['undefined', undefined, 'UnknownError'],
        ])('should classify %s as UnknownError', (_label, thrown, expectedError) => {
            expect(toErrorAnalytics(thrown)).toEqual({ kind: 'UnknownError', error: expectedError });
        });

        it('should default the message to "Unknown error" when the value cannot be stringified', () => {
            expect(toErrorAnalytics(Object.create(null))).toEqual({ kind: 'UnknownError', error: 'Unknown error' });
        });
    });

    describe('payload safety (the Mixpanel payload is publicly visible)', () => {
        it('should emit only allow-listed scalar keys', () => {
            const payloads = [
                toErrorAnalytics(new HttpError(500, JSON.stringify({ kind: 'X' }), { url: '/x', method: 'GET' })),
                toErrorAnalytics(new ValidationError('bad', 'secretFieldName')),
                toErrorAnalytics(new BaseError('boom', 'X', { token: 'SECRET' })),
                toErrorAnalytics(new Error('boom')),
            ];
            for (const payload of payloads) {
                for (const key of Object.keys(payload)) {
                    expect(ALLOWED_KEYS).toContain(key);
                }
            }
        });

        it('should never leak the original cause or a ValidationError key', () => {
            expect(toErrorAnalytics(new ValidationError('bad', 'fieldName'))).not.toHaveProperty('key');
            expect(toErrorAnalytics(new BaseError('boom', 'X', { secret: 1 }))).not.toHaveProperty('originalError');
        });
    });
});
