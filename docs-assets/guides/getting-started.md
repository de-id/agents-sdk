---
title: Getting started
category: Guides
---

# Getting started

This guide takes a blank browser application to a connected agent that answers a question and says a scripted line. It covers the credentials the SDK needs, {@link createAgentManager}, {@link AgentManager.connect | connect()}, the difference between {@link AgentManager.chat | chat()} and {@link AgentManager.speak | speak()}, and {@link AgentManager.disconnect | disconnect()}. The SDK runs in the browser only: it needs WebRTC and a `<video>` element, and there is nothing for it to render in Node.

## 1. Get an agent id and a client key

1. Log in to [D-ID Studio](https://studio.d-id.com) and create an agent — image, voice and knowledge.
2. In the [agents gallery](https://studio.d-id.com/agents), hover over the agent, open the `[...]` menu and click **`</>` Embed**.
3. Set the list of domains the agent may be used from, for example `http://localhost`.
4. Copy `data-agent-id` and `data-client-key` out of the snippet.

The client key is the credential to use in a page. It is scoped to one agent and to the domains you allowed, which is what makes it safe to ship in front-end code — see {@link ClientKeyAuth}. {@link BearerToken} and {@link BasicAuth} are also accepted by {@link Auth}, but they authorize the whole account, so keep them on a server.

## 2. Install the package

```shell
npm i @d-id/client-sdk
```

The package ships an ES module, a UMD build and its own TypeScript types; no separate `@types` package is needed.

## 3. Create the manager

{@link createAgentManager} fetches the agent before it resolves, so {@link AgentManager.agent | agent} and {@link AgentManager.starterMessages | starterMessages} are readable straight away. Nothing is opened on the wire yet.

The one callback a video session cannot work without is {@link AgentManagerCallbacks.onSrcObjectReady | onSrcObjectReady}: it hands you the `MediaStream` to put on your `<video>` element. `createAgentManager()` rejects with a {@link ValidationError} when it is missing in any chat mode that streams video — which is every mode except {@link ChatMode.TextOnly}, {@link ChatMode.Playground} and {@link ChatMode.Maintenance}.

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
```

The whole options object is read once and never written to, {@link AgentManagerOptions.callbacks | callbacks} included. Assigning a handler to the object afterwards has no effect, so give each handler a stable identity and read your changing state from inside it — in React, from a ref.

## 4. Connect

{@link AgentManager.connect | connect()} creates the stream, the chat and, on Talks (V2) and Clips (V3) agents, the notifications web socket. It resolves once the connection has reached {@link ConnectionState.Connected | 'connected'}, by which point `onSrcObjectReady` has already fired.

```ts
await agentManager.connect();
```

A second `connect()` made while the first is still in flight returns that same promise rather than opening a second session, which is what makes it safe in a React StrictMode effect. Once a session exists it rejects instead: call {@link AgentManager.disconnect | disconnect()} first to start a fresh conversation, or {@link AgentManager.reconnect | reconnect()} to keep the current one.

## 5. Make the agent talk

Two methods do it, and they are not interchangeable.

- {@link AgentManager.chat | chat()} sends the user's message to the agent's LLM and the agent answers in its own words. The answer arrives through {@link AgentManagerCallbacks.onNewMessage | onNewMessage}, first as `partial` chunks and then as the full `answer`, while the video plays it.
- {@link AgentManager.speak | speak()} makes the agent say exactly what you give it, with no LLM involved. Use it for greetings and scripted lines. It takes a {@link SpeakScript} — `{ type: 'text', input }` or `{ type: 'audio', audio_url }` — or a plain string as shorthand for a text script.

```ts
await agentManager.speak({ type: 'text', input: `Hi! I'm ${agentManager.agent.name}.` });
await agentManager.chat('What is the distance to the moon?');
```

Render the transcript from `onNewMessage` rather than from the `chat()` result: on Expressive (V4) agents the answer travels over the data channel and the resolved {@link ChatResponse} is empty.

## 6. Disconnect

Call {@link AgentManager.disconnect | disconnect()} when the user leaves the conversation or the page, so the session stops consuming credits. After it resolves the manager is reusable — `connect()` opens a new session with a new chat.

```ts
await agentManager.disconnect();
```

## The whole thing

```ts
import * as sdk from '@d-id/client-sdk';

const videoElement = document.getElementById('agent-video') as HTMLVideoElement;
let srcObject: MediaStream | undefined;

const agentManager = await sdk.createAgentManager('agt_fumf1234', {
    auth: { type: 'key', clientKey: 'YOUR_CLIENT_KEY' },
    // Talks (V2) and Clips (V3) agents only; Expressive (V4) agents ignore these.
    streamOptions: { compatibilityMode: 'auto', streamWarmup: true },
    callbacks: {
        onSrcObjectReady(value) {
            srcObject = value;
            videoElement.srcObject = value;
        },
        onVideoStateChange(state) {
            // Legacy streams swap between the agent's idle video and the live stream.
            if (state === 'STOP') {
                videoElement.srcObject = null;
                videoElement.src = agentManager.agent.idle_video ?? '';
            } else {
                videoElement.src = '';
                videoElement.srcObject = srcObject ?? null;
            }
        },
        onConnectionStateChange(state, reason) {
            console.log('connection', state, reason);
        },
        onNewMessage(messages, type) {
            if (type === 'answer') {
                console.log(messages[messages.length - 1].content);
            }
        },
        onError(error) {
            console.error(error);
        },
    },
});

await agentManager.connect();
await agentManager.speak({ type: 'text', input: `Hi! I'm ${agentManager.agent.name}.` });
await agentManager.chat('What is the distance to the moon?');
await agentManager.disconnect();
```

`onVideoStateChange` is the right signal to swap video sources on a **legacy** stream — a Talks (V2) agent, or a Clips (V3) agent that did not ask for {@link StreamOptions.fluent | fluent}. A fluent stream sends one video for both states, and every Expressive (V4) session is fluent, so there is nothing to swap; branch on {@link AgentManager.getStreamType | getStreamType()} if the same code has to serve both.

## Where to go next

- The four chat modes an application chooses between, and what each one creates on the wire: [Chat modes](https://sdk.d-id.com/documents/Chat_modes.html).
- Running your own functions when the agent's LLM asks for them: [Client tools](https://sdk.d-id.com/documents/Client_tools.html).
- Microphone, camera, speech-to-text and interrupts on Expressive (V4) agents: [Expressive media](https://sdk.d-id.com/documents/Expressive_media.html).
- Which failures reject and which reach `onError`: [Handling errors](https://sdk.d-id.com/documents/Handling_errors.html).

## See also

- {@link createAgentManager} — the entry point, and everything it validates.
- {@link AgentManagerOptions} — every option, including {@link AgentManagerOptions.initialMessages | initialMessages} and {@link AgentManagerOptions.analytics | analytics}.
- {@link AgentManagerCallbacks} — the full set of handlers.
- {@link AgentManager} — the methods on the manager.
- {@link StreamOptions} — transport settings for Talks (V2) and Clips (V3) agents.
