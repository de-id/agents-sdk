---
title: Expressive media
category: Guides
---

# Expressive media

An Expressive (V4) session is two-way: the page can publish the user's microphone and camera, interrupt the agent, and send its own data-channel messages. It can also change the speech-to-text language mid-conversation, so the agent hears the user in whatever language they switch to. This guide covers those methods, what they do on Talks (V2) and Clips (V3) agents, and how to tell which session you are in.

Read the tier off {@link AgentAvatar}: `agentManager.agent.avatar.type === 'expressive'` is the check every branch below is written against.

## The microphone

{@link AgentManager.publishMicrophoneStream | publishMicrophoneStream()} takes a `MediaStream` and publishes its audio track to the session. Getting the stream is the browser's job, and the permission prompt is yours to time.

```ts
const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
await agentManager.publishMicrophoneStream(micStream);
```

{@link AgentManager.unpublishMicrophoneStream | unpublishMicrophoneStream()} is the counterpart, and is what to call to mute the user for the rest of the session:

```ts
await agentManager.unpublishMicrophoneStream();
```

{@link AgentManager.replaceMicrophoneTrack | replaceMicrophoneTrack()} swaps the live track without unpublishing it, which is what a device picker wants. The publication survives the swap — its LiveKit publication id (SID) and SSRC stay the same, though the `MediaStreamTrack` id changes — so the server sees continuous audio rather than a stop and a restart. It rejects with a plain `Error` from the transport for four different reasons — the room is not connected, the track is not an audio track, a publish is already in flight, or nothing is published to replace — so a bare `catch` that republishes would republish on three failures that have nothing to do with the swap. Only the last one is worth falling back on, and the message is what distinguishes it.

```ts
async function useInputDevice(deviceId: string) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId } });
    const [track] = stream.getAudioTracks();

    try {
        await agentManager.replaceMicrophoneTrack(track);
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('No microphone publication')) {
            throw error; // Not connected, not audio, or a publish already in flight.
        }

        // Nothing published yet — publish instead of swapping.
        await agentManager.publishMicrophoneStream(stream);
    }
}
```

## The camera

{@link AgentManager.publishCameraStream | publishCameraStream()} and {@link AgentManager.unpublishCameraStream | unpublishCameraStream()} are the same pair for video. Vision has to be enabled on the agent for the frames to be used — {@link Agent.vision} says whether it is, so check it before offering the control.

```ts
if (agentManager.agent.vision?.enabled) {
    const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
    await agentManager.publishCameraStream(cameraStream);
}
```

## Speech-to-text

Two methods, and they answer different questions.

{@link AgentManager.getSttToken | getSttToken()} fetches a short-lived token for D-ID's speech-to-text service, for an application that runs its own transcription. It is not an Expressive (V4) method: the request goes out whenever it is called, connected or not and whatever the avatar type, and the service decides whether to issue a token for the agent. It rejects with an {@link HttpError} when it does not.

{@link AgentManager.setSttLanguage | setSttLanguage()} switches the language the *session* transcribes in, in the middle of a conversation. It takes a language name or a BCP-47 code, and it is Expressive (V4) only, after `connect()`.

```ts
await agentManager.setSttLanguage('en-US');
await agentManager.setSttLanguage('Spanish');
```

A room that has dropped since `connect()` reports a {@link StreamError} through {@link AgentManagerCallbacks.onError | onError} and the promise still resolves — so the failure to watch for is on the callback, not on the `await`.

## Interrupting the agent

Interrupting is a property of the *stream*, not of the avatar tier: it needs a fluent stream, which means any Expressive (V4) agent, or a Clips (V3) agent built on a Pro avatar that asked for it — {@link StreamOptions.fluent | fluent} is off unless you set it. Two different questions decide whether to show a stop button and whether to enable it.

- {@link AgentManager.isInterruptAvailable | isInterruptAvailable()} — does this session support interrupting at all? `true` on a fluent stream once connected. Ask it once the connection is up, to decide whether the control belongs on screen.
- {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange} — is interrupting allowed *right now*? Expressive (V4) agents only. It goes `false` while a `blocking` client tool call is outstanding, because the agent is suspended waiting for it, and back to `true` when the call finishes.

{@link AgentManager.interrupt | interrupt()} itself never throws. On every avatar type it returns without doing anything when interrupting is not available, when it is not allowed right now, and — on Talks (V2) and Clips (V3) agents — when the stream is not fluent or no video is playing.

```ts
import { type AgentManagerCallbacks } from '@d-id/client-sdk';

const callbacks: AgentManagerCallbacks = {
    onSrcObjectReady(value) {
        videoElement.srcObject = value;
    },
    onConnectionStateChange(state) {
        if (state === 'connected') {
            setStopButtonVisible(agentManager.isInterruptAvailable());
        }
    },
    onInterruptibleChange(interruptible) {
        setStopButtonEnabled(interruptible);
    },
};

stopButton.onclick = () => agentManager.interrupt();

// The user typed over the answer instead of pressing the button. Expressive (V4) agents
// drop `text` interrupts, because the orchestrator does not cancel the answer in flight.
composer.onInput = () => agentManager.interrupt({ type: 'text' });
```

The interrupted message is marked `interrupted` in the next {@link AgentManagerCallbacks.onNewMessage | onNewMessage} — but only when an interrupt was actually sent. A call that finds nothing to interrupt leaves the transcript untouched and fires no callback, so do not use the callback as an acknowledgement.

## Application messages on the data channel

{@link AgentManager.sendDataChannelMessage | sendDataChannelMessage()} sends a JSON payload to the agent on one of the topics in {@link DataChannelTopic} — the presentation topic tells a deck to change slide, for instance. Expressive (V4) agents only, after `connect()`.

```ts
import { DataChannelTopic } from '@d-id/client-sdk';

await agentManager.sendDataChannelMessage(DataChannelTopic.Presentation, {
    type: 'navigate',
    slide: 3,
});

// The topic's plain string value is accepted too.
await agentManager.sendDataChannelMessage('did.presentation', { type: 'navigate', slide: 4 });
```

As with `setSttLanguage()`, a dropped room surfaces as a {@link StreamError} on {@link AgentManagerCallbacks.onError | onError} while the promise still resolves.

## What happens on Talks (V2) and Clips (V3)

The methods do not all fail the same way, and the difference is deliberate: the ones that *add* something reject, and the ones that *remove* something succeed, so a teardown path never has to guard on the avatar type.

| Method | Talks (V2) / Clips (V3), or before `connect()` |
| --- | --- |
| `publishMicrophoneStream()` | rejects with a {@link ValidationError} |
| `replaceMicrophoneTrack()` | rejects with a {@link ValidationError} |
| `publishCameraStream()` | rejects with a {@link ValidationError} |
| `setSttLanguage()` | rejects with a {@link ValidationError} |
| `sendDataChannelMessage()` | rejects with a {@link ValidationError} |
| `registerClientTool()` | throws a {@link ValidationError} (synchronously, and before `connect()` too) |
| `unpublishMicrophoneStream()` | resolves, having done nothing |
| `unpublishCameraStream()` | resolves, having done nothing |
| `interrupt()` | returns, having done nothing |
| `getSttToken()` | works — it is not an Expressive-only method |

```ts
if (agentManager.agent.avatar.type === 'expressive') {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await agentManager.publishMicrophoneStream(micStream);
}

// No guard needed: this is a no-op wherever there is nothing published.
await agentManager.unpublishMicrophoneStream();
```

## See also

- {@link AgentManager.publishMicrophoneStream | publishMicrophoneStream()}, {@link AgentManager.unpublishMicrophoneStream | unpublishMicrophoneStream()}, {@link AgentManager.replaceMicrophoneTrack | replaceMicrophoneTrack()}.
- {@link AgentManager.publishCameraStream | publishCameraStream()}, {@link AgentManager.unpublishCameraStream | unpublishCameraStream()}.
- {@link AgentManager.getSttToken | getSttToken()} and {@link SttTokenResponse}; {@link AgentManager.setSttLanguage | setSttLanguage()}.
- {@link AgentManager.interrupt | interrupt()}, {@link InterruptOptions}, {@link AgentManager.isInterruptAvailable | isInterruptAvailable()}, {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange}.
- {@link AgentManager.sendDataChannelMessage | sendDataChannelMessage()} and {@link DataChannelTopic}.
- {@link AgentManager.getStreamType | getStreamType()} and {@link StreamType} — fluent or legacy, which is what interrupting depends on.
- [Client tools](./client-tools.md) — the other half of what an Expressive (V4) session can do.
