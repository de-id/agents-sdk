---
title: Chat modes
category: Guides
---

# Chat modes

The chat mode decides how the agent answers: with a streamed video, as text only, or not at all. It is set once with {@link AgentManagerOptions.mode | options.mode} and changed later with {@link AgentManager.changeMode | changeMode()}. What it actually controls is narrower than it looks — whether a chat is created for the session, whether {@link AgentManager.connect | connect()} opens the notifications web socket, and whether the agent's answers are turned into video — which is why a session built for one mode may not serve another. The full list is {@link ChatMode}.

## The four modes an application chooses

| Mode | What it is for | `chat()` | Video for answers |
| --- | --- | --- | --- |
| {@link ChatMode.Functional} | The default. A conversation with the agent's LLM, answered in a streamed video. | works | yes |
| {@link ChatMode.TextOnly} | A text chat with no talking head. | works | no |
| {@link ChatMode.DirectPlayback} | The application scripts every line itself with `speak()`. | rejects | yes |
| {@link ChatMode.Off} | Chat switched off, video still streaming. | rejects | yes |

Two more exist that applications do not normally set. {@link ChatMode.Maintenance} is what the SDK switches to by itself when connecting fails after its retries, and what the server can answer with when a chat is created, so a UI can say the agent is temporarily out of service; `chat()` rejects while it is in force. {@link ChatMode.Playground} is the test mode behind the agent playground in D-ID Studio: it marks each chat request with a playground header and always goes over the Agents API, even for Expressive (V4) agents.

## What each mode does on the wire

On a Talks (V2) or Clips (V3) agent, {@link AgentManager.connect | connect()} builds up to three things, and the mode decides which:

| Mode | Chat created | Notifications web socket | WebRTC stream |
| --- | --- | --- | --- |
| `Functional` | yes | yes | yes |
| `TextOnly` | yes | yes | yes |
| `Playground` | yes | yes | yes |
| `Maintenance` | yes | yes | yes |
| `Off` | no | yes | yes |
| `DirectPlayback` | no | no | yes |

Two things are worth reading off that table. The stream is created in every mode, the textual ones included — the mode decides what is delivered over it, not whether it exists, which is why a {@link ChatMode.TextOnly} application that does not want a stream at all should simply not call `connect()`. And {@link ChatMode.Off} and {@link ChatMode.DirectPlayback} differ in exactly one thing: the notifications web socket, which `Off` still opens and `DirectPlayback` skips.

Expressive (V4) agents build none of that the same way. They never use the notifications web socket — chat and speech travel on the LiveKit data channel — and the SDK builds their chat itself, as `cht_<sessionId>`, with the mode {@link ChatMode.Functional}. The first `connect()` therefore adopts `Functional` and reports it through {@link AgentManagerCallbacks.onModeChange | onModeChange}, even for a manager created with {@link ChatMode.TextOnly}.

## Choosing the mode at creation

```ts
import * as sdk from '@d-id/client-sdk';
import { ChatMode } from '@d-id/client-sdk';

const agentManager = await sdk.createAgentManager('agt_fumf1234', {
    auth: { type: 'key', clientKey: 'YOUR_CLIENT_KEY' },
    mode: ChatMode.TextOnly,
    // TextOnly, Playground and Maintenance are the three modes that do not need
    // `onSrcObjectReady`; every other mode streams video and `createAgentManager()`
    // rejects with a ValidationError without it.
    callbacks: {
        onNewMessage(messages, type) {
            if (type === 'answer') {
                render(messages);
            }
        },
    },
});
```

Unlike `AgentAvatar.type` and the topic of {@link AgentManager.sendDataChannelMessage | sendDataChannelMessage()}, `mode` takes the enum member only: `mode: 'TextOnly'` does not compile, so {@link ChatMode} has to be imported.

## Changing the mode later

{@link AgentManager.changeMode | changeMode()} is asynchronous because it usually tears the stream down, and the promise resolves once that teardown has finished:

```ts
await agentManager.changeMode(ChatMode.TextOnly);
// The stream is gone. Nothing else is needed for a text-only conversation.

await agentManager.changeMode(ChatMode.Functional);
await agentManager.connect(); // Build a session that can carry a conversation again.
```

The rules behind those two lines:

1. Switching to anything other than {@link ChatMode.Functional} disconnects the stream, because those modes produce no video.
2. Switching *into* {@link ChatMode.Functional} disconnects it as well whenever the open session is missing something a conversation needs — a {@link ChatMode.DirectPlayback} session has neither the notifications web socket the answer arrives on nor a chat to send to. Call {@link AgentManager.connect | connect()} again after a change that tore the session down.
3. Passing the mode already in effect does nothing at all, callback included.
4. Every guard in the SDK reads the mode the session is in right now, not the one {@link createAgentManager} was given. {@link AgentManager.getChatMode | getChatMode()} returns it, so nothing has to be mirrored in application state.

## Reacting to a mode the application did not ask for

The mode can change without the application asking. The server can answer the chat-creation request with a different mode, and a connection that fails after the SDK's retries leaves the session in {@link ChatMode.Maintenance}. Both arrive through {@link AgentManagerCallbacks.onModeChange | onModeChange}; a downgrade to a non-`Functional` mode also reports a {@link ChatModeDowngraded} error through {@link AgentManagerCallbacks.onError | onError}.

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
    // ValidationError on an Expressive (V4) agent: only Talks (V2) and Clips (V3)
    // sessions can keep a stream running with no chat behind it.
    console.error(error);
}
```

A mode the *server* reports is treated differently from one the application asks for: if a chat carrying `Off` or `DirectPlayback` somehow reaches an Expressive (V4) session, the SDK logs a warning and keeps the mode it has rather than failing a connection that is otherwise working.

## See also

- {@link ChatMode} — every member, and what each one does.
- {@link AgentManager.changeMode | changeMode()} — the transition rules and what it rejects.
- {@link AgentManager.getChatMode | getChatMode()} — the mode in effect right now.
- {@link AgentManagerCallbacks.onModeChange | onModeChange} — when the mode changes underneath you.
- {@link ChatModeDowngraded} — the error reported when the server narrows the mode.
- [Handling errors](./handling-errors.md) — which failures reject and which reach `onError`.
