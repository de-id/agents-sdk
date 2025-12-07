import { Auth } from '../types/auth';
import { getAuthHeader, getExternalId } from './get-auth-header';

jest.mock('../utils', () => ({
    getRandom: jest.fn(() => 'mocked-random-id'),
}));

const { getRandom } = require('../utils');
const mockGetRandom = getRandom as jest.Mock;

describe('getExternalId', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    it('should return the provided externalId and store it in localStorage', () => {
        const externalId = 'user-123';
        const result = getExternalId(externalId);

        expect(result).toBe(externalId);
        expect(window.localStorage.getItem('did_external_key_id')).toBe(externalId);
    });

    it('should return existing externalId from localStorage when no parameter is provided', () => {
        const existingId = 'existing-user-id';
        window.localStorage.setItem('did_external_key_id', existingId);

        const result = getExternalId();

        expect(result).toBe(existingId);
        expect(window.localStorage.getItem('did_external_key_id')).toBe(existingId);
    });

    it('should generate and store a new externalId when localStorage is empty and no parameter is provided', () => {
        const { getRandom } = require('../utils');
        const mockRandomId = 'generated-id-456';
        (getRandom as jest.Mock).mockReturnValueOnce(mockRandomId);

        const result = getExternalId();

        expect(result).toBe(mockRandomId);
        expect(window.localStorage.getItem('did_external_key_id')).toBe(mockRandomId);
    });

    it('should update localStorage when a new externalId is provided', () => {
        const oldId = 'old-user-id';
        const newId = 'new-user-id';
        window.localStorage.setItem('did_external_key_id', oldId);

        const result = getExternalId(newId);

        expect(result).toBe(newId);
        expect(window.localStorage.getItem('did_external_key_id')).toBe(newId);
    });

    it('should handle empty string as a valid externalId', () => {
        const emptyId = '';
        const result = getExternalId(emptyId);

        expect(result).toBe(emptyId);
        expect(window.localStorage.getItem('did_external_key_id')).toBe(emptyId);
    });
});

describe('getAuthHeader', () => {
    beforeEach(() => {
        window.localStorage.clear();
        jest.resetModules();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    describe('Bearer token auth', () => {
        it('should return Bearer token header', () => {
            const auth: Auth = { type: 'bearer', token: 'test-token-123' };
            const result = getAuthHeader(auth);

            expect(result).toBe('Bearer test-token-123');
        });

        it('should ignore externalId for bearer auth', () => {
            const auth: Auth = { type: 'bearer', token: 'test-token-123' };
            const result = getAuthHeader(auth, 'user-123');

            expect(result).toBe('Bearer test-token-123');
        });
    });

    describe('Basic auth', () => {
        it('should return Basic auth header with base64 encoded credentials', () => {
            const auth: Auth = { type: 'basic', username: 'user', password: 'pass' };
            const result = getAuthHeader(auth);

            expect(result).toBe('Basic ' + btoa('user:pass'));
        });

        it('should ignore externalId for basic auth', () => {
            const auth: Auth = { type: 'basic', username: 'user', password: 'pass' };
            const result = getAuthHeader(auth, 'user-123');

            expect(result).toBe('Basic ' + btoa('user:pass'));
        });
    });

    describe('Client-Key auth', () => {
        beforeEach(() => {
            mockGetRandom.mockReturnValue('mocked-random-id');
        });

        it('should return Client-Key header with clientKey and generated externalId', () => {
            const mockRandomId = 'generated-external-id';
            mockGetRandom.mockReturnValueOnce(mockRandomId);

            const auth: Auth = { type: 'key', clientKey: 'test-client-key' };
            const result = getAuthHeader(auth);

            expect(result).toBe('Client-Key test-client-key.generated-external-id_mocked-random-id');
        });

        it('should use provided externalId in Client-Key header', () => {
            const auth: Auth = { type: 'key', clientKey: 'test-client-key' };
            const externalId = 'user-123';
            const result = getAuthHeader(auth, externalId);

            expect(result).toBe('Client-Key test-client-key.user-123_mocked-random-id');
            expect(result).toContain('user-123');
        });

        it('should use externalId from localStorage when not provided', () => {
            const existingId = 'stored-user-id';
            window.localStorage.setItem('did_external_key_id', existingId);

            const auth: Auth = { type: 'key', clientKey: 'test-client-key' };
            const result = getAuthHeader(auth);

            expect(result).toBe('Client-Key test-client-key.stored-user-id_mocked-random-id');
            expect(result).toContain('stored-user-id');
        });

        it('should generate new externalId and store it when localStorage is empty', () => {
            const mockRandomId = 'new-generated-id';
            mockGetRandom.mockReturnValueOnce(mockRandomId);

            const auth: Auth = { type: 'key', clientKey: 'test-client-key' };
            const result = getAuthHeader(auth);

            expect(result).toBe('Client-Key test-client-key.new-generated-id_mocked-random-id');
            expect(result).toContain('new-generated-id');
            expect(window.localStorage.getItem('did_external_key_id')).toBe(mockRandomId);
        });

        it('should update localStorage with provided externalId', () => {
            const auth: Auth = { type: 'key', clientKey: 'test-client-key' };
            const externalId = 'new-user-id';
            getAuthHeader(auth, externalId);

            expect(window.localStorage.getItem('did_external_key_id')).toBe(externalId);
        });
    });

    describe('Error handling', () => {
        it('should throw error for unknown auth type', () => {
            const auth = { type: 'unknown' } as any;

            expect(() => getAuthHeader(auth)).toThrow('Unknown auth type: [object Object]');
        });
    });
});
