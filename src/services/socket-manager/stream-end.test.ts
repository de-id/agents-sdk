import { StreamEndReason } from '@sdk/types';
import { toStreamEnded } from './stream-end';

describe('toStreamEnded', () => {
    it('should map every close reason the legacy streams report', () => {
        expect(toStreamEnded({ close_reason: 'manual' }).reason).toBe(StreamEndReason.Ok);
        expect(toStreamEnded({ close_reason: 'inactivity' }).reason).toBe(StreamEndReason.Inactivity);
        expect(toStreamEnded({ close_reason: 'peer_disconnected' }).reason).toBe(StreamEndReason.NetworkIssue);
        expect(toStreamEnded({ close_reason: 'shutdown' }).reason).toBe(StreamEndReason.UnknownError);
    });

    it('should report an unrecognised or missing close reason as an unknown error', () => {
        expect(toStreamEnded({ close_reason: 'something-new' }).reason).toBe(StreamEndReason.UnknownError);
        expect(toStreamEnded({}).reason).toBe(StreamEndReason.UnknownError);
    });

    it('should always report a done status, since legacy never sends stream/error', () => {
        expect(toStreamEnded({ close_reason: 'shutdown' }).status).toBe('done');
    });

    it('should carry the completion time when the stream reports one', () => {
        const completed_at = '2026-09-07T10:00:00.000Z';

        expect(toStreamEnded({ completed_at }).timestamp).toBe(Date.parse(completed_at));
    });

    it('should fall back to now when the stream reports no completion time', () => {
        const before = Date.now();

        expect(toStreamEnded({}).timestamp).toBeGreaterThanOrEqual(before);
    });
});
