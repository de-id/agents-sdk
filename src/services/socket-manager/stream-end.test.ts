import { StreamEndReason } from '@sdk/types';
import { toStreamEndReason } from './stream-end';

describe('toStreamEndReason', () => {
    it('should map every close reason the legacy streams report', () => {
        expect(toStreamEndReason({ close_reason: 'manual' })).toBe(StreamEndReason.Ok);
        expect(toStreamEndReason({ close_reason: 'inactivity' })).toBe(StreamEndReason.Inactivity);
        expect(toStreamEndReason({ close_reason: 'peer_disconnected' })).toBe(StreamEndReason.NetworkIssue);
        expect(toStreamEndReason({ close_reason: 'shutdown' })).toBe(StreamEndReason.UnknownError);
    });

    it('should report an unrecognised or missing close reason as an unknown error', () => {
        expect(toStreamEndReason({ close_reason: 'something-new' })).toBe(StreamEndReason.UnknownError);
        expect(toStreamEndReason({})).toBe(StreamEndReason.UnknownError);
    });
});
