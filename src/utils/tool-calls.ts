import { RunningToolCall } from '@sdk/types';

/**
 * Whether the agent is waiting on a tool call before it can continue.
 * True while any running call is 'blocking'. False when nothing is running,
 * or when everything running is 'async' and the agent is still available.
 */
export function isAwaitingTool(calls: readonly RunningToolCall[]): boolean {
    return calls.some(call => call.executionMode === 'blocking');
}
