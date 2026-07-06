import { _resetOfflineBufferForTests, initializeAnalytics } from './mixpanel';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('initializeAnalytics offline buffer', () => {
    const originalFetch = globalThis.fetch;
    let fetchSpy: jest.Mock;

    beforeEach(() => {
        _resetOfflineBufferForTests();
        fetchSpy = jest.fn();
        (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchSpy;
    });

    afterEach(() => {
        (globalThis as unknown as { fetch: typeof originalFetch }).fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('re-sends an event that failed to send once connectivity returns', async () => {
        const analytics = initializeAnalytics({ token: 't', agentId: 'a', isEnabled: true });

        // The network is down — the fire-and-forget POST rejects and the event is buffered.
        fetchSpy.mockRejectedValueOnce(new Error('Failed to fetch'));
        await analytics.track('agent-connection-state-change', {
            state: 'disconnected',
            reason: 'webrtc:ice-disconnected',
        });
        await tick();
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        // Connectivity returns -> the buffered event is flushed, preserving its reason.
        fetchSpy.mockResolvedValueOnce({ ok: true });
        window.dispatchEvent(new Event('online'));
        await tick();

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const flushedBody = String((fetchSpy.mock.calls[1][1] as { body: URLSearchParams }).body);
        expect(flushedBody).toContain('webrtc%3Aice-disconnected');
    });

    it('buffers and retries on an HTTP error status, not only on network rejections', async () => {
        const analytics = initializeAnalytics({ token: 't', agentId: 'a', isEnabled: true });

        // fetch resolves, but Mixpanel returns 5xx — must still be treated as a failure and buffered.
        fetchSpy.mockResolvedValueOnce({ ok: false, status: 503 });
        await analytics.track('agent-error', { error: { kind: 'X' } });
        await tick();
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        fetchSpy.mockResolvedValueOnce({ ok: true });
        window.dispatchEvent(new Event('online'));
        await tick();
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does not re-send when the original event sent successfully', async () => {
        const analytics = initializeAnalytics({ token: 't', agentId: 'a', isEnabled: true });

        fetchSpy.mockResolvedValue({ ok: true });
        await analytics.track('agent-chat', { event: 'connect' });
        await tick();

        window.dispatchEvent(new Event('online'));
        await tick();

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
});
