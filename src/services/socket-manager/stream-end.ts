import { StreamEndReason, StreamEndedPayload } from '@sdk/types';

const CLOSE_REASONS: Record<string, StreamEndReason> = {
    manual: StreamEndReason.Ok,
    inactivity: StreamEndReason.Inactivity,
    peer_disconnected: StreamEndReason.NetworkIssue,
    shutdown: StreamEndReason.UnknownError,
};

/** Legacy streams report the session end as `stream/done` with a `close_reason`. */
export function toStreamEnded(data: any): StreamEndedPayload {
    return {
        status: 'done',
        reason: CLOSE_REASONS[data.close_reason] ?? StreamEndReason.UnknownError,
        timestamp: Date.parse(data.completed_at) || Date.now(),
    };
}
