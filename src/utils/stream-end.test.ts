import { StreamEndReason } from '@sdk/types';
import { toStreamEndReason } from './stream-end';

describe('toStreamEndReason', () => {
    it('should map every close reason the legacy streams report', () => {
        expect(toStreamEndReason({ close_reason: 'manual' })).toBe(StreamEndReason.Ok);
        expect(toStreamEndReason({ close_reason: 'inactivity' })).toBe(StreamEndReason.Inactivity);
        expect(toStreamEndReason({ close_reason: 'peer_disconnected' })).toBe(StreamEndReason.NetworkIssue);
        expect(toStreamEndReason({ close_reason: 'shutdown' })).toBe(StreamEndReason.UnknownError);
    });

    it('should forward a reason it does not recognise rather than calling it an error', () => {
        expect(toStreamEndReason({ close_reason: 'something-new' })).toBe('something-new');
    });

    it('should report no reason when the stream sent none', () => {
        expect(toStreamEndReason({})).toBeUndefined();
    });
});
