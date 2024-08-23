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

**Please note:** This SDK is designed for front-end development only. The creation of Agents and Knowledge bases should be handled through the [Agents API](https://docs.d-id.com/reference/agents-overview) or directly within the [D-ID Studio](https://studio.d-id.com/agents).

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
   This will be explained in the [Usage section](#➤-%EF%B8%8F-callback-functions) in this guide.
5. Define an object called `streamOptions` [optional]  
   This will be explained in the [Usage section](#➤-%EF%B8%8F-stream-options) in this guide.
6. Create an instance of the `createAgentManger` object called `agentManager` with the values created above.  
   This will be explained later in the [Usage section](#➤-%EF%B8%8F-agent-manager) in this guide.

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

// 5. Define the Stream Options object (Optional)
let streamOptions = { compatibilityMode: 'auto', streamWarmup: true };

//....Rest of the APP's code here....//
//...................................//

// 6. Create the 'agentManager' instance with the values created above
let agentManager = await sdk.createAgentManager(agentId, { auth, callbacks, streamOptions });
```

## ✴️ Usage

### ➤ ✴️ Agent Manager

#### **Built-in Properties**

The `agentManager` object created during initialization has several built-in parameters that might come in handy.

-   **`agentManager.agent`**  
    Displaying all of the Agent's saved information (Same as the following [endpoint](/reference/getagent))
-   **`agentManager.starterMessages`**  
    Displaying the Agent's defined Starter Messages.

#### **Built-in Methods**

The `agentManager` object created during initialization has several built-in methods that allow you to interact with your Agent.

-   **`agentManager.connect()`**  
    Method to create a new connection with an Agent (new WebRTC connection, web-socket, new Agent chat ID)

-   **`agentManager.speak({type, input})`**  
     Method to make your Agent stream back a video based on a text or audio file.  
     (Similar to [Talks Streams](https://docs.d-id.com/reference/talks-streams-overview) / [Clips Streams API](https://docs.d-id.com/reference/clips-streams-overview))

    ```javascript Text - JavaScript
    let speak = agentManager.speak({
        type: 'text',
        input: "Hi! I'm Alice!",
    });
    ```

    ```javascript Audio File - JavaScript
    let speak = agentManager.speak(
        {
          type: "audio",
          audio_url: "http://www.yourwebsite.com/audio.mp3";
        }
    )
    ```

-   **`agentManager.chat(string)`**  
     Method to send a message to your Agent and get a streamed video based on its answer (LLM)

    ```javascript JavaScript
    let chat = agentManager.chat('What is the distance to the moon?');
    ```

-   **`agentManager.rate(messageID, score)`**  
    Method to rate the Agent's answer in the chat - for future analytics and insights.

-   **`agentManager.reconnect()`**  
    Method to reconnect to the Agent when the session expires and continue the conversation on the same chat ID.

-   **`agentManager.disconnect()`**  
    Method to close the existing connection and chat with the Agent.

### ➤ ✴️ Callback Functions

Callback functions enable you to manage various events throughout the SDK lifecycle. Each function is linked to one or more methods within the built-in `agentManager` and triggers automatically to handle specific events efficiently

-   **`onSrcObjectReady(value)`:**  
    [**MANDATORY for using the SDK**] - Linking the Streamed video and audio to the HTML element.  
    The `value` of this callback function is passed to the HTML video element in the following function.  
    Triggered when `agentManager.connect(), agentManager.reconnect(), agentManager.disconnect()` are called.

    ```javascript
     onSrcObjectReady(value) {
        videoElement.srcObject = value
        srcObject = value
        return srcObject
      }
    ```

-   **`onVideoStateChange(state)`:**  
    Displaying the state of the streamed video, used for switching the HTML element's source between the idle and streamed videos.  
    Triggered when `agentManager.chat() and agentManager.speak()` are called.

    ```javascript
    onVideoStateChange(state) {
        console.log("onVideoStateChange(): ", state)
        if (state == "STOP") {
            videoElement.srcObject = undefined
            videoElement.src = agentManager.agent.presenter.idle_video
        }
        else {
            videoElement.src = ""
            videoElement.srcObject = srcObject
            connectionLabel.innerHTML = "Online"
        }
    }
    ```

-   **`onConnectionStateChange(state):`**  
    Displaying the different connection states with the Agent's WebRTC stream connection  
    Triggered when `agentManager.connect(), agentManager.reconnect(), agentManager.disconnect()` are called.

    ```javascript
    onConnectionStateChange(state) {
        console.log("onConnectionStateChange(): ", state)
        if (state == "connected") {
            console.log("I'm ready to go!")
        }
    }
    ```

    ```javascript Example Values
    state: ['new', 'fail', 'connecting', 'connected', 'disconnected', 'closed'];
    ```

-   **`onNewMessage(messages, type)`:**  
    Displaying the chat messages array when a new message is sent to the chat.  
    `type`: `answer` indicates the full answer replied in the streamed video.  
    `role`: `user`, `assistant`(Agent)

    Triggered when `agentManager.chat()` is called:

    ```javascript
    onNewMessage(messages, type) {
        console.log(messages, type)
    }
    ```

    ```javascript Example Values
    type: ['partial', 'answer'];

    messages: [
        {
            role: 'assistant',
            content: "Hi! I'm an Agent. How can I help you?",
            created_at: '2024-07-08T08:35:54.503Z',
            id: '35113960da531',
        },
        {
            role: 'user',
            content: 'What is the distance to the moon?',
            created_at: '2024-07-08T08:36:48.036Z',
            id: 'f82377af5a9c4',
        },
        {
            role: 'assistant',
            content:
                "The average distance to the moon is about 238,855 miles (384,400 kilometers). That's about 30 times the diameter of the Earth!",
            id: '49b86saf2aff8',
            created_at: '2024-07-08T08:36:48.037Z',
            matches: [],
        },
    ];
    ```

-   **`onError(error, errorData)`:**  
     Throwing an error and displaying the error message when things go badly.

    ```javascript
    onError(error, errorData) {
        console.log("Error:", error, "Error Data", errorData)
    }
    ```

### ➤ ✴️ Stream Options

- **`compatibilityMode`**:  
  Defines the video codec to be used in the stream.  
  When set to `"on"`: VP8 will be used.  
  When set to `"off"`: H264 will be used  
  When set to `"auto"` - the codec will be selected according to the browser [Default]  
  <br />
- **`streamWarmup`**:  
  Allowed values:  
  `true` -  warmup video will be streamed when the connection is established.  
  `false` - no warmup video [Default]  
  <br />
- **`sessionTimeout`**:  
  **Can only be used with proper permissions**  
  Maximum duration (in seconds) between messages before the session times out.  
  Max value: `300`  
  <br />
- **`outputResolution`**:  
  **Supported only with Talk presenters (photo-based).**  
  The output resolution sets the maximum height or width pixels of the streamed video.  
  When resolution is not configured, it defaults to the agent output resolution.  
  Allowed values: `150 - 1080`

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
