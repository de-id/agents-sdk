/**
 * @jest-environment node
 *
 * The package must be importable outside a browser. Server-rendered frameworks
 * (Next.js, Remix, SvelteKit, Astro) evaluate the module graph on the server, so
 * touching `window`, `document` or `crypto` at module scope turns a plain import
 * into a `ReferenceError`. This test runs in Jest's `node` environment, where
 * none of those globals exist.
 */
jest.mock('@sdk/config/environment', () => ({
    nodeEnv: 'test',
    didApiUrl: 'http://localhost',
    didSocketApiUrl: 'ws://localhost',
    mixpanelKey: '',
    agentId: '',
}));

describe('importing the package outside a browser', () => {
    it('has no browser globals', () => {
        expect(typeof window).toBe('undefined');
        expect(typeof document).toBe('undefined');
    });

    it('evaluates the public entry point without throwing', async () => {
        const sdk = await import('./index');

        expect(typeof sdk.createAgentManager).toBe('function');
        expect(typeof sdk.isDIDError).toBe('function');
        expect(typeof sdk.HttpError).toBe('function');
    });
});
