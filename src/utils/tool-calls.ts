import { RunningToolCall } from '@sdk/types';

/**
 * Whether the agent is waiting on a tool call before it can continue.
 *
 * True while any of the running calls is `blocking`; false when nothing is running, or when
 * everything running is `async` and the agent can keep talking. Pass it the array
 * {@link AgentManagerCallbacks.onRunningToolCallsChange | onRunningToolCallsChange} hands you, to
 * decide whether to show the user that the agent is busy.
 *
 * @param calls - The tool calls running right now, as reported by
 * {@link AgentManagerCallbacks.onRunningToolCallsChange | onRunningToolCallsChange}. See
 * {@link RunningToolCall}.
 * @returns `true` while the agent is suspended on a blocking tool call.
 * @example
 * ```ts
 * import { isAwaitingTool, type AgentManagerCallbacks } from '@d-id/client-sdk';
 *
 * const callbacks: AgentManagerCallbacks = {
 *     onRunningToolCallsChange(calls) {
 *         setSpinnerVisible(isAwaitingTool(calls));
 *     },
 * };
 * ```
 * @category Callbacks & Events
 */
export function isAwaitingTool(calls: readonly RunningToolCall[]): boolean {
    return calls.some(call => call.executionMode === 'blocking');
}
