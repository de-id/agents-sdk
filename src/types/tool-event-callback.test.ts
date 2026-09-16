jest.mock('@sdk/config/environment', () => ({
    nodeEnv: 'test',
    didApiUrl: 'http://localhost',
    didSocketApiUrl: 'ws://localhost',
    mixpanelKey: '',
    agentId: '',
}));

import type {
    AgentManagerCallbacks,
    ToolCallDonePayload,
    ToolCallErrorPayload,
    ToolCallStartedPayload,
    ToolEventCallback,
} from '../index';
import { ToolCallEvent } from '../index';

const call = {
    callId: 'call_1',
    name: 'get_weather',
    input: { city: 'Tel Aviv' },
    timestamp: '2026-09-16T10:00:00.000Z',
};
const started: ToolCallStartedPayload = { ...call, interruptible: false, executionMode: 'blocking' };
const done: ToolCallDonePayload = { ...call, output: { c: 31 }, durationMs: 120, extra: {} };
const failed: ToolCallErrorPayload = {
    ...call,
    output: null,
    durationMs: 5000,
    extra: {},
    error: 'upstream timed out',
};

/**
 * `ToolEventCallback` is one signature over a union of labelled argument tuples, not a set of
 * overloads: overloads only narrow for a call, never for the body of a handler written against
 * them, so an inline `onToolEvent(event, data)` saw the union of all three payloads and reading
 * `data.durationMs` was a `TS2339`. These are compile-time assertions first — `yarn type-check` is
 * what fails if the pairing is lost — and the runtime expectations only pin what the handler read.
 */
describe('ToolEventCallback pairs each event with its own payload', () => {
    it('narrows the payload inside an inline handler on the callbacks object', () => {
        const seen: string[] = [];

        const callbacks: AgentManagerCallbacks = {
            onToolEvent(event, data) {
                if (event === ToolCallEvent.Started) {
                    // `input` is on the started payload only.
                    seen.push(`started:${data.name}:${Object.keys(data.input).join()}`);
                } else if (event === ToolCallEvent.Done) {
                    // `durationMs` and `output` are on the done payload only.
                    seen.push(`done:${data.output.c}:${data.durationMs}`);
                } else {
                    // `error` is on the error payload only.
                    seen.push(`error:${data.error ?? 'none'}`);
                }
            },
        };

        callbacks.onToolEvent?.(ToolCallEvent.Started, started);
        callbacks.onToolEvent?.(ToolCallEvent.Done, done);
        callbacks.onToolEvent?.(ToolCallEvent.Error, failed);

        expect(seen).toEqual(['started:get_weather:city', 'done:31:120', 'error:upstream timed out']);
    });

    it('narrows the payload inside a standalone function annotated with the type', () => {
        const handler: ToolEventCallback = (event, data) => {
            if (event === ToolCallEvent.Done) {
                expect(data.durationMs).toBe(120);
            }
        };

        handler(ToolCallEvent.Done, done);
    });

    it('rejects a payload that does not belong to its event', () => {
        const handler: ToolEventCallback = () => {};

        // @ts-expect-error a done payload cannot be delivered as a `started` event.
        handler(ToolCallEvent.Started, done);
        // @ts-expect-error an error payload cannot be delivered as a `done` event.
        handler(ToolCallEvent.Done, failed);
        // @ts-expect-error the event and the payload cannot be swapped.
        handler(started, ToolCallEvent.Started);

        expect(done.durationMs).toBe(120);
    });
});
