---
title: Client tools
category: Guides
---

# Client tools

A client tool is a function that runs in the user's browser when the agent's LLM decides to call it. It is how an agent reaches things only the page knows — the contents of a cart, the user's locale, the slide currently on screen — and how it acts on them. The tool itself is declared in the agent's configuration; the SDK's job is to bind a name from that configuration to an implementation with {@link AgentManager.registerClientTool | registerClientTool()} and to report what happens through {@link AgentManagerCallbacks.onToolEvent | onToolEvent}.

Client tools are an **Expressive (V4)** feature. They travel on the real-time session's RPC channel, which Talks (V2) and Clips (V3) agents do not have, so {@link AgentManager.registerClientTool | registerClientTool()} throws a {@link ValidationError} on those rather than registering a handler the agent could never call. The check is on the agent, not on the connection, so it applies before {@link AgentManager.connect | connect()} too.

## 1. Register the handlers

Register before {@link AgentManager.connect | connect()}, so the agent can call a tool from the moment the session starts. Registering the same name again replaces the handler.

```ts
import * as sdk from '@d-id/client-sdk';

const agentManager = await sdk.createAgentManager('agt_fumf1234', {
    auth: { type: 'key', clientKey: 'YOUR_CLIENT_KEY' },
    callbacks: {
        onSrcObjectReady(value) {
            videoElement.srcObject = value;
        },
    },
});

agentManager.registerClientTool('get_cart_total', async args => {
    const total = await cart.total(args.currency as string);
    return JSON.stringify({ total, currency: args.currency });
});

// Nothing to await: a synchronous handler may return the string directly.
agentManager.registerClientTool('get_locale', () => JSON.stringify({ locale: navigator.language }));

await agentManager.connect();
```

## The handler contract

A handler is a {@link ClientToolHandler}: `(args: Record<string, unknown>) => string | Promise<string>`.

- **It is given the LLM's arguments, already parsed.** The SDK parses the JSON the agent sent and hands you the object. The values are typed `unknown`, because their shape is the agent's tool schema rather than anything the SDK knows — narrow or cast them yourself.
- **It must return a JSON string.** Not an object: whatever the handler resolves with is sent back to the agent verbatim, so serialize it. `JSON.stringify` is the whole of it.
- **The result is capped at 15 KiB.** That is the transport's response limit, not the SDK's, and a larger result fails the call. Return an id or a summary rather than a document.
- **Throwing is how a tool reports failure.** The SDK rejects the call and forwards the error message to the agent, which can then say something sensible instead of waiting. Do not swallow errors into a `{ "error": … }` string unless you want the LLM to treat the call as a success.

```ts
agentManager.registerClientTool('book_appointment', async args => {
    const slot = args.slot as string;

    if (!(await calendar.isFree(slot))) {
        // The message reaches the agent, which can offer another time.
        throw new Error(`${slot} is no longer available`);
    }

    const booking = await calendar.book(slot);
    return JSON.stringify({ bookingId: booking.id });
});
```

## Blocking and async tools

Whether the agent waits for a call is a property of the tool in the agent's configuration, not of the handler, and it reaches the SDK as {@link ToolExecutionMode} on {@link RunningToolCall.executionMode} and {@link ToolCallStartedPayload.executionMode}:

- **`blocking`** — the agent is suspended until the handler resolves. Anything the user is waiting on an answer for belongs here, and it is what makes a spinner worth showing.
- **`async`** — the agent keeps talking while the handler runs, and the call can outlive the turn that started it. Fire-and-forget side effects belong here.

A blocking call also suspends interrupting: {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange} goes `false` while any blocking call is outstanding and back to `true` when the last one finishes, because there is nothing to interrupt while the agent is waiting.

## 2. Follow the calls

{@link AgentManagerCallbacks.onToolEvent | onToolEvent} is called once when a call starts, and again when it finishes or fails. Its type, {@link ToolEventCallback}, is three overloads rather than one signature — {@link ToolCallEvent.Started} with a {@link ToolCallStartedPayload}, {@link ToolCallEvent.Done} with a {@link ToolCallDonePayload}, {@link ToolCallEvent.Error} with a {@link ToolCallErrorPayload}.

Overloads narrow where a function is *called*, not where it is written, so an inline handler sees `data` as the union of the three payloads however it branches on `event`. `callId`, `name`, `input` and `timestamp` are on all three and can be read straight off it; assert the payload for the fields that belong to one event.

```ts
import {
    ToolCallEvent,
    type AgentManagerCallbacks,
    type ToolCallDonePayload,
    type ToolCallErrorPayload,
} from '@d-id/client-sdk';

const callbacks: AgentManagerCallbacks = {
    onToolEvent(event, data) {
        if (event === ToolCallEvent.Started) {
            console.log('started', data.callId, data.name, data.input);
        } else if (event === ToolCallEvent.Done) {
            const done = data as ToolCallDonePayload;
            console.log('done', done.name, done.output, `${done.durationMs}ms`);
        } else {
            // `error` is the reason when the server gave one; the structured failure is in
            // `extra.error`, and `output` is typed `unknown` — narrow it before use.
            const failed = data as ToolCallErrorPayload;
            console.warn('failed', failed.name, failed.error ?? 'no reason given');
        }
    },
};
```

{@link ToolCallEvent} members are also accepted as their plain string values, so `event === 'tool-call/done'` works without importing the enum.

## 3. Show that the agent is busy

{@link AgentManagerCallbacks.onRunningToolCallsChange | onRunningToolCallsChange} carries the whole set of calls running right now, as {@link RunningToolCall} entries, every time it changes. A call appears when it starts and disappears when it finishes or fails — or, for a blocking call, when its turn ends. The callback also fires with an empty array on disconnect, so a spinner driven by it always clears.

{@link isAwaitingTool} answers the only question most UIs have of that array: is the agent suspended on a blocking call?

```ts
import { isAwaitingTool, type AgentManagerCallbacks } from '@d-id/client-sdk';

const callbacks: AgentManagerCallbacks = {
    onSrcObjectReady(value) {
        videoElement.srcObject = value;
    },
    onRunningToolCallsChange(calls) {
        setSpinnerVisible(isAwaitingTool(calls));
        setStatusText(calls.map(call => call.name).join(', '));
    },
    onInterruptibleChange(interruptible) {
        setStopButtonEnabled(interruptible);
    },
};
```

## 4. Clean up

{@link AgentManager.unregisterClientTool | unregisterClientTool()} removes a handler. Unlike `registerClientTool()` it never throws — an unknown name, and any avatar type, is a no-op — so it is safe in a React cleanup path that runs whatever the agent turned out to be.

```ts
useEffect(() => {
    agentManager.registerClientTool('get_cart_total', getCartTotal);
    return () => agentManager.unregisterClientTool('get_cart_total');
}, [agentManager]);
```

After a tool is unregistered the agent's calls to it fail rather than reaching your code, which is the right outcome: the agent hears that the tool is gone.

## See also

- {@link AgentManager.registerClientTool | registerClientTool()} and {@link AgentManager.unregisterClientTool | unregisterClientTool()}.
- {@link ClientToolHandler} — the handler signature and its limits.
- {@link ToolEventCallback}, {@link ToolCallEvent} and the three payloads: {@link ToolCallStartedPayload}, {@link ToolCallDonePayload}, {@link ToolCallErrorPayload}.
- {@link RunningToolCall}, {@link ToolExecutionMode} and {@link isAwaitingTool}.
- {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange} — why a blocking tool makes the agent uninterruptible.
- [Expressive media](https://sdk.d-id.com/documents/Expressive_media.html) — the rest of what an Expressive (V4) session can do.
