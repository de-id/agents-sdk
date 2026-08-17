import { RunningToolCall } from '@sdk/types';
import { isAwaitingTool } from './tool-calls';

const call = (callId: string, executionMode: RunningToolCall['executionMode']): RunningToolCall => ({
    callId,
    name: 'tool',
    executionMode,
});

describe('isAwaitingTool', () => {
    it('should return false when nothing is running', () => {
        expect(isAwaitingTool([])).toBe(false);
    });

    it('should return true while a blocking call is running', () => {
        expect(isAwaitingTool([call('a', 'blocking')])).toBe(true);
    });

    it('should return false when everything running is async', () => {
        expect(isAwaitingTool([call('a', 'async'), call('b', 'async')])).toBe(false);
    });

    it('should return true when a blocking call runs alongside async ones', () => {
        expect(isAwaitingTool([call('a', 'async'), call('b', 'blocking')])).toBe(true);
    });
});
