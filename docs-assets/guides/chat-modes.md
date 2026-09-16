---
title: Chat modes
category: Guides
---

# Chat modes

The chat mode decides how the agent answers: with a streamed video, as text only, or not at all. It is set with {@link AgentManagerOptions.mode | options.mode} and changed later with {@link AgentManager.changeMode | changeMode()}. The full list is {@link ChatMode}.

## The four modes an application chooses

| Mode | What it is for | `chat()` | Video for answers |
| --- | --- | --- | --- |
| {@link ChatMode.Functional} | The default. A conversation with the agent's LLM, answered in a streamed video. | works | yes |
| {@link ChatMode.TextOnly} | A text chat with no talking head. Talks (V2) and Clips (V3) agents. | works | no |
| {@link ChatMode.DirectPlayback} | The application scripts every line itself with `speak()`. | rejects | yes |
| {@link ChatMode.Off} | Chat switched off, video still streaming. | rejects | yes |

Two more exist that applications do not normally set. {@link ChatMode.Maintenance} is what the SDK switches to when connecting fails after its retries, so a UI can say the agent is temporarily out of service; `chat()` rejects while it is in force. {@link ChatMode.Playground} is the test mode behind the agent playground in D-ID Studio.

## What each mode does on the wire

On a Talks (V2) or Clips (V3) agent, {@link AgentManager.connect | connect()} always creates the WebRTC stream; the mode decides whether a chat is created and whether the notifications web socket is opened:

| Mode | Chat created | Notifications web socket |
| --- | --- | --- |
| `Functional`, `TextOnly`, `Playground`, `Maintenance` | yes | yes |
| `Off` | no | yes |
| `DirectPlayback` | no | no |

A {@link ChatMode.TextOnly} application that wants no stream at all simply does not call `connect()`.

Expressive (V4) agents chat over the LiveKit data channel and the SDK builds their chat as {@link ChatMode.Functional}, so the first `connect()` adopts `Functional` and reports it through {@link AgentManagerCallbacks.onModeChange | onModeChange}. There is no text-only conversation with an Expressive (V4) agent: `chat()` in {@link ChatMode.TextOnly} has no session to send on.

## Choosing the mode at creation

```ts
import * as sdk from '@d-id/client-sdk';
import { ChatMode } from '@d-id/client-sdk';

const agentManager = await sdk.createAgentManager('agt_fumf1234', {
    auth: { type: 'key', clientKey: 'YOUR_CLIENT_KEY' },
    mode: ChatMode.TextOnly, // Textual modes do not need `onSrcObjectReady`.
    callbacks: {
        onNewMessage(messages, type) {
            if (type === 'answer') {
                render(messages);
            }
        },
    },
});
```

`mode` takes the enum member only: `mode: 'TextOnly'` does not compile.

## Changing the mode later

{@link AgentManager.changeMode | changeMode()} resolves once the change is in effect. Any mode but {@link ChatMode.Functional} disconnects the stream, and a change into `Functional` disconnects a session that was not built for a conversation, so call {@link AgentManager.connect | connect()} again when a change tore the session down. {@link AgentManager.getChatMode | getChatMode()} returns the mode in effect.

```ts
await agentManager.changeMode(ChatMode.TextOnly);
// The stream is gone. Nothing else is needed for a text-only conversation.

await agentManager.changeMode(ChatMode.Functional);
await agentManager.connect(); // Build a session that can carry a conversation again.
```

## Reacting to a mode the application did not ask for

The server can answer the chat-creation request with a different mode, and a connection that fails after the SDK's retries leaves the session in {@link ChatMode.Maintenance}. Both arrive through {@link AgentManagerCallbacks.onModeChange | onModeChange}; a downgrade also reports a {@link ChatModeDowngraded} error through {@link AgentManagerCallbacks.onError | onError}.

```ts
import { ChatMode, isDIDError, type AgentManagerCallbacks } from '@d-id/client-sdk';

const callbacks: AgentManagerCallbacks = {
    onSrcObjectReady(value) {
        videoElement.srcObject = value;
    },
    onModeChange(mode) {
        // `chat()` rejects in Maintenance too, so the composer goes with the banner below.
        setComposerEnabled(
            mode !== ChatMode.Off && mode !== ChatMode.DirectPlayback && mode !== ChatMode.Maintenance
        );
        setVideoVisible(mode === ChatMode.Functional);

        if (mode === ChatMode.Maintenance) {
            showBanner('The agent is temporarily unavailable.');
        }
    },
    onError(error) {
        if (isDIDError(error) && error.kind === 'ChatModeDowngraded') {
            // The server answered with a narrower mode than the one that was asked for.
            console.warn(error.message);
        }
    },
};
```

## Expressive (V4) restrictions

{@link ChatMode.Off} and {@link ChatMode.DirectPlayback} are Talks (V2) and Clips (V3) features. On an Expressive (V4) agent both {@link createAgentManager} and {@link AgentManager.changeMode | changeMode()} reject them with a {@link ValidationError}:

```ts
try {
    await agentManager.changeMode(ChatMode.DirectPlayback);
} catch (error) {
    console.error(error); // ValidationError on an Expressive (V4) agent.
}
```

## See also

- {@link ChatMode} — every member, and what each one does.
- {@link AgentManager.changeMode | changeMode()} — what it disconnects and what it rejects.
- {@link AgentManager.getChatMode | getChatMode()} — the mode in effect right now.
- {@link AgentManagerCallbacks.onModeChange | onModeChange} — when the mode changes underneath you.
- {@link ChatModeDowngraded} — the error reported when the server narrows the mode.
- [Handling errors](./handling-errors.md) — which failures reject and which reach `onError`.
