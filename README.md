# D-ID Client SDK

[![npm version](https://img.shields.io/npm/v/@d-id/client-sdk)](https://www.npmjs.com/package/@d-id/client-sdk)
[![license](https://img.shields.io/npm/l/@d-id/client-sdk)](https://github.com/de-id/agents-sdk/blob/main/LICENSE)
[![docs coverage](https://sdk.d-id.com/coverage.svg)](https://sdk.d-id.com/)

![D-ID Agents SDK](https://create-images-results.d-id.com/api_docs/assets/agents_sdk_cover_v2.png)

The D-ID Agents SDK embeds an agent you built in D-ID Studio — or a real-time streaming avatar — into a web application. It wraps the D-ID Agents and Streams APIs behind one object: create an `AgentManager` for an agent, `connect()`, then `chat()` to have the agent answer with its own LLM or `speak()` to have it say exactly what you give it. The SDK handles the WebRTC or LiveKit session, the chat transcript and the reconnects.

**Please note:** This SDK is designed for front-end development only. The creation of Agents and Knowledge bases should be handled through the [Agents API](https://docs.d-id.com/docs/agent-quickstart) or directly within the [D-ID Studio](https://studio.d-id.com/agents).

> **Version 3.0 is a breaking release.** Upgrading from 2.x? Read the [migration guide](https://sdk.d-id.com/documents/Migration_guide.html).

## Install

```shell
npm i @d-id/client-sdk
```

You need an agent id and a client key. Both come from the agent's `</> Embed` snippet in the [D-ID Studio agents gallery](https://studio.d-id.com/agents), which is also where you list the domains the agent may be used from — see [Getting started](https://sdk.d-id.com/documents/Getting_started.html).

## Quick start

```ts
import * as sdk from '@d-id/client-sdk';

const videoElement = document.getElementById('agent-video') as HTMLVideoElement;
const agentManager = await sdk.createAgentManager('agt_fumf1234', {
    auth: { type: 'key', clientKey: 'YOUR_CLIENT_KEY' },
    callbacks: {
        onSrcObjectReady: stream => (videoElement.srcObject = stream),
        onNewMessage: messages => console.log(messages[messages.length - 1].content),
    },
});

await agentManager.connect();
await agentManager.speak({ type: 'text', input: "Hi! I'm Alice!" });
await agentManager.chat('What is the distance to the moon?');
await agentManager.disconnect();
```

## Next steps

The full API reference — every method, callback, option and type, generated from the source on each release — is at **[sdk.d-id.com](https://sdk.d-id.com/)**. Start with [`createAgentManager()`](https://sdk.d-id.com/functions/createAgentManager.html), [`AgentManager`](https://sdk.d-id.com/interfaces/AgentManager.html) and [`AgentManagerCallbacks`](https://sdk.d-id.com/interfaces/AgentManagerCallbacks.html).

The guides:

- [Getting started](https://sdk.d-id.com/documents/Getting_started.html) — credentials, the first connection, `chat()` and `speak()`, disconnecting.
- [Chat modes](https://sdk.d-id.com/documents/Chat_modes.html) — video, text-only or speak-only, and what each one creates on the wire.
- [Client tools](https://sdk.d-id.com/documents/Client_tools.html) — running your own functions when the agent's LLM calls them.
- [Expressive media](https://sdk.d-id.com/documents/Expressive_media.html) — microphone, camera, speech-to-text, interrupts and data-channel messages.
- [Handling errors](https://sdk.d-id.com/documents/Handling_errors.html) — which failures reject, which reach `onError`, and what to log.
- [Migration guide](https://sdk.d-id.com/documents/Migration_guide.html) — every breaking change from 2.x.

A working sample project in Vanilla JavaScript and Vite is in the [demo repository](https://github.com/de-id/Agents-SDK-Demo).

## Requirements

- **A modern browser with WebRTC.** The SDK streams the agent's video over WebRTC (Talks and Clips) or LiveKit (Expressive), and renders it into a `<video>` element you provide.
- **ESM and UMD builds.** `import` resolves to the ES module; `require` and a `<script>` tag resolve to the UMD bundle.
- **TypeScript types included.** They ship with the package; there is no separate `@types` to install.
- **Node is not a runtime target**, but importing the package on a server is safe: the module graph touches no browser globals at import time, so server-rendered frameworks (Next.js, Remix, SvelteKit, Astro) can evaluate it. Everything past `createAgentManager()` needs a browser.

## Avatar types

- **Talks (V2)** — Photo-based presenters using WebRTC streaming.
- **Clips (V3)** — Pre-built presenter avatars using WebRTC streaming.
- **Expressive (V4)** — Next-generation avatars using LiveKit-based streaming, supporting microphone input and always-on fluent mode.

## Support

Questions, bug reports and documentation issues are welcome as [GitHub issues](https://github.com/de-id/agents-sdk/issues). The product documentation lives at [docs.d-id.com](https://docs.d-id.com).
