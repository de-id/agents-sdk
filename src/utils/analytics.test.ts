import { getErrorMessage } from './analytics';

describe('getErrorMessage', () => {
    it('returns the message of an Error', () => {
        expect(getErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('stringifies non-Error values', () => {
        expect(getErrorMessage('plain string')).toBe('plain string');
        expect(getErrorMessage(42)).toBe('42');
    });

    it('returns empty string for null/undefined', () => {
        expect(getErrorMessage(null)).toBe('');
        expect(getErrorMessage(undefined)).toBe('');
    });

    it('truncates messages to 256 characters', () => {
        expect(getErrorMessage(new Error('x'.repeat(500)))).toHaveLength(256);
    });

    it('does not throw on values that cannot be stringified', () => {
        expect(getErrorMessage(Object.create(null))).toBe('Unknown error');
    });
});
