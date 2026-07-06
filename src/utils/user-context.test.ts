import { getUserContextAttributes } from './user-context';

function mockNavigator(userAgent: string, platform: string): void {
    Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
    Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
}

function mockTimezone(timeZone: string | undefined): void {
    jest.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
        resolvedOptions: () => ({ timeZone }) as Intl.ResolvedDateTimeFormatOptions,
    } as Intl.DateTimeFormat);
}

describe('getUserContextAttributes', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('resolves the IANA timezone', () => {
        mockTimezone('America/New_York');
        mockNavigator('Mozilla/5.0 (Macintosh)', 'MacIntel');

        expect(getUserContextAttributes().timezone).toBe('America/New_York');
    });

    it('describes a desktop Mac', () => {
        mockTimezone('Europe/Berlin');
        mockNavigator('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel');

        expect(getUserContextAttributes().device).toBe('Mac OS X, Desktop');
    });

    it('detects a mobile Android device from the user agent', () => {
        mockTimezone('Asia/Tokyo');
        mockNavigator('Mozilla/5.0 (Linux; Android 14; Pixel)', 'Linux armv8l');

        expect(getUserContextAttributes().device).toBe('Android, Mobile');
    });

    it('detects iOS', () => {
        mockTimezone('Asia/Tokyo');
        mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'iPhone');

        expect(getUserContextAttributes().device).toBe('iOS, Mobile');
    });

    it('detects Windows desktop', () => {
        mockTimezone('America/Chicago');
        mockNavigator('Mozilla/5.0 (Windows NT 10.0)', 'Win32');

        expect(getUserContextAttributes().device).toBe('Windows, Desktop');
    });

    it('omits timezone when it is unavailable', () => {
        mockTimezone(undefined);
        mockNavigator('Mozilla/5.0 (Windows NT 10.0)', 'Win32');

        expect(getUserContextAttributes()).not.toHaveProperty('timezone');
        expect(getUserContextAttributes().device).toBe('Windows, Desktop');
    });
});
