# Agents SDK Overview 📙

<div style="display: flex; flex-direction: row; align-items: center; justify-content: space-evenly; min-height: 1px; font-size: 16px;">
  <img style="width: auto; height: 200px; object-fit: contain;" src="https://create-images-results.d-id.com/api_docs/assets/agents_sdk_cover_v2.png" alt="Agents SDK Cover" />
  <span style="width: 67%; text-align: justify;">
    <br> Welcome to the Agents SDK documentation!<br> Here, you’ll find everything you need to know to get started with the SDK, understand its core concepts, utilize built-in methods, and access additional resources.<br> This guide is designed to help you integrate the Agents SDK into your projects effectively and efficiently.
  </span>
</div>

## ✴️ Introduction

The D-ID Agents SDK provides a seamless integration pathway for embedding your created Agents or real-time streaming avatars into web applications.

With a streamlined and user-friendly workflow, you can easily harness the capabilities of the D-ID Agents and Streams API right out of the box.

The SDK supports three avatar types:

- **Talks (V2)** — Photo-based presenters using WebRTC streaming.
- **Clips (V3)** — Pre-built presenter avatars using WebRTC streaming.
- **Expressives (V4)** — Next-generation avatars using LiveKit-based streaming, supporting microphone input and always-on fluent mode.

**Please note:** This SDK is designed for front-end development only. The creation of Agents and Knowledge bases should be handled through the [Agents API](https://docs.d-id.com/docs/agent-quickstart) or directly within the [D-ID Studio](https://studio.d-id.com/agents).

> 📚 **Full API reference:** [sdk.d-id.com](https://sdk.d-id.com/) — every method, callback, option and type, generated from the source on each release. ![Docs coverage](https://sdk.d-id.com/coverage.svg)

## ✴️ Getting Started

### ➤ ✴️ Prerequisites

Follow these steps:

1. Log in to the [D-ID Studio](http://studio.d-id.com)
2. Create a new Agent with the required options - Image, voice, etc.
3. In the [Agents gallery](https://studio.d-id.com/agents), hover with your mouse over the created Agent, then click on the `[...]` button
4. Click on `</> Embed` button
5. Set the list of allowed domains for your Agent, for example: `http://localhost`
   This is an additional security measurement: your Agent can be accessed only from the domains allowed by you.
6. In the code snippet section, fetch the `data-client-key` and the `data-agent-id`, these will be used later to access your Agent.

### ➤ ✴️ Installation

In your front-end application folder, install the Agents SDK library using `npm`.

```shell
npm i @d-id/client-sdk
```

Alternatively, you can clone the SDK from its [GitHub repository](https://github.com/de-id/agents-sdk).

### ➤ ✴️ Initialization

In your front-end application,

1. Import the Agents SDK library
2. Paste the `data-agent-id` obtained in the prerequisites step in the `agentId` variable
3. Paste the `data-client-key` obtained in the prerequisites step in the `auth.clientKey` variable
4. Define an object called `callbacks`.
   This will be explained in the [Usage section](https://sdk.d-id.com/interfaces/AgentManagerCallbacks.html) in this guide.
5. Define an object called `streamOptions` [optional — v2/v3 avatars only]
   This will be explained in the [Usage section](https://sdk.d-id.com/interfaces/StreamOptions.html) in this guide.
6. Create an instance of the `createAgentManger` object called `agentManager` with the values created above.
   This will be explained later in the [Usage section](https://sdk.d-id.com/interfaces/AgentManager.html) in this guide.

Example:

```javascript
// 1. Import the Agents SDK library
import * as sdk from '@d-id/client-sdk';

// 2. Paste the `data-agent-id' in the 'agentId' variable
let agentId = 'agt_fumf1234';

// 3. Paste the 'data-client-key' in the 'auth.clientKey' variable
let auth = { type: 'key', clientKey: 'Z3123asdaczxSXSAasdcxzcashDY6MGSASFsafxSDdfASY2k0TUhPcEVsTnBR' };

// 4. Define the SDK callbacks functions in this object
const callbacks = {};

// 5. Define the Stream Options object (Optional — v2/v3 avatars only)
let streamOptions = { compatibilityMode: 'auto', streamWarmup: true };

//....Rest of the APP's code here....//
//...................................//

// 6. Create the 'agentManager' instance with the values created above
let agentManager = await sdk.createAgentManager(agentId, { auth, callbacks, streamOptions });
```

## ✴️ Usage

Everything the `agentManager` exposes — methods, callbacks, stream options and every type — is documented in the **[API reference](https://sdk.d-id.com/)**, generated from the source on each release. Start with:

- [`createAgentManager()`](https://sdk.d-id.com/functions/createAgentManager.html) — initialization and options
- [`AgentManager`](https://sdk.d-id.com/interfaces/AgentManager.html) — `connect()`, `speak()`, `chat()`, `interrupt()`, microphone and camera publishing, client tools
- [`AgentManagerCallbacks`](https://sdk.d-id.com/interfaces/AgentManagerCallbacks.html) — `onSrcObjectReady` (mandatory), `onVideoStateChange`, `onConnectionStateChange`, `onNewMessage`, …
- [`StreamOptions`](https://sdk.d-id.com/interfaces/StreamOptions.html) — Talks (V2) and Clips (V3) transport options

A minimal end-to-end flow:

```javascript
import * as sdk from '@d-id/client-sdk';

const videoElement = document.getElementById('agent-video');

const agentManager = await sdk.createAgentManager('agt_fumf1234', {
    auth: { type: 'key', clientKey: 'YOUR_CLIENT_KEY' },
    callbacks: {
        onSrcObjectReady(value) {
            videoElement.srcObject = value;
        },
        onConnectionStateChange(state) {
            console.log('connection:', state);
        },
    },
});

await agentManager.connect();
await agentManager.speak({ type: 'text', input: "Hi! I'm Alice!" });
await agentManager.chat('What is the distance to the moon?');
```

## ✴️ See it in Action

Explore our demo repository on GitHub to see the Agents SDK in action!
This repository features a sample project crafted in Vanilla JavaScript and Vite, utilizing the Agents SDK to help you get started swiftly.

[GitHub Demo Repository](https://github.com/de-id/Agents-SDK-Demo)

## ✴️ Support

<div style="display: flex; flex-direction: row; justify-content: space-evenly; min-height: 1px">
  <img style="width: 37%; border-radius: 5px; object-fit: cover;" src="https://create-images-results.d-id.com/api_docs/assets/questions.png" alt="Support Image" />
  <span style="width: 3%"><br/></span>
  <span style="width: 60%; text-align: left;">
    Have any questions? We are here to help! Please leave your question in the Discussions section and we will be happy to answer shortly.<br/><br/>
    <a href="https://docs.d-id.com/discuss">
      <span style="width: 30%; text-align: center; background: #ff882eff; color: #fff; display: inline-block; padding: 6px; border-radius: 5px;">
        Ask a question
      </span>
    </a>
  </span>
</div>

<div style="display: flex; flex-direction: row; justify-content: space-evenly; min-height: 1px">
  <span style="width: 100%; text-align: center; background: linear-gradient(to right, #ff882eff , #fff); color: #fff; display: inline-block; padding: 6px; border-radius: 3px;">
  </span>
</div>
