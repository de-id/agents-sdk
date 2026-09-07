import { StreamEndReason } from '@sdk/types';

const LEGACY_CLOSE_REASON_TO_END_REASON: Record<string, StreamEndReason> = {
    manual: StreamEndReason.Ok,
    inactivity: StreamEndReason.Inactivity,
    peer_disconnected: StreamEndReason.NetworkIssue,
    shutdown: StreamEndReason.UnknownError,
};

/** Legacy streams report the session end as `stream/done` with a `close_reason`. */
export function toStreamEndReason(data: any): StreamEndReason {
    return LEGACY_CLOSE_REASON_TO_END_REASON[data.close_reason] ?? StreamEndReason.UnknownError;
}
