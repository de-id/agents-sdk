---
title: Expressive agents
category: Guides
---

# Expressive agents

An Expressive (V4) session is two-way: the page can publish the user's microphone and camera, change the speech-to-text language mid-conversation, and send its own data-channel messages. Interrupting works here too, and on Clips (V3) agents with a fluent stream. The last section lists what each method does on Talks (V2) and Clips (V3) agents.

Read the tier off {@link AgentAvatar}: `agentManager.agent.avatar.type === 'expressive'` is the check every branch below is written against.

## The microphone

{@link AgentManager.publishMicrophoneStream | publishMicrophoneStream()} takes a `MediaStream` and publishes its audio track to the session. Get the stream with `getUserMedia()`; the SDK does not prompt for permission.

```ts
const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
await agentManager.publishMicrophoneStream(micStream);
```

{@link AgentManager.unpublishMicrophoneStream | unpublishMicrophoneStream()} is the counterpart. It removes the track from the session but does not stop it: the stream is yours, so stop its tracks to release the microphone.

```ts
await agentManager.unpublishMicrophoneStream();
micStream.getTracks().forEach(track => track.stop());
```

{@link AgentManager.replaceMicrophoneTrack | replaceMicrophoneTrack()} swaps the live track without unpublishing it, which is what a device picker wants. The publication survives the swap — its LiveKit publication id (SID) and SSRC stay the same, though the `MediaStreamTrack` id changes — so the server sees continuous audio rather than a stop and a restart.

The previous track is not stopped either; stop it once the swap succeeds.

It rejects with a plain `Error` for four reasons: the room is not connected, the track is not an audio track, a publish is already in flight, or nothing is published to replace. Only the last is worth falling back on, and the message is what distinguishes it, so do not republish from a bare `catch`.

```ts
let currentTrack: MediaStreamTrack | undefined;

async function useInputDevice(deviceId: string) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId } });
    const [track] = stream.getAudioTracks();

    try {
        await agentManager.replaceMicrophoneTrack(track);
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('No microphone publication')) {
            track.stop();
            throw error; // Not connected, not audio, or a publish already in flight.
        }

        // Nothing published yet: publish instead of swapping.
        await agentManager.publishMicrophoneStream(stream);
    }

    currentTrack?.stop();
    currentTrack = track;
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

{@link AgentManager.getSttToken | getSttToken()} fetches a short-lived Azure Speech token, for an application that runs its own transcription. It works on every avatar type, connected or not, and rejects with an {@link HttpError} when the agent is neither public nor the caller's.

{@link AgentManager.setSttLanguage | setSttLanguage()} switches the language the *session* transcribes in, in the middle of a conversation. It takes a language name or a BCP-47 code, and it is Expressive (V4) only, after `connect()`. A language the service does not recognize is ignored without an error, and transcription carries on in the previous one.

```ts
await agentManager.setSttLanguage('en-US');
await agentManager.setSttLanguage('Spanish');
```

A room that has dropped since `connect()` reports a {@link StreamError} through {@link AgentManagerCallbacks.onError | onError} and the promise still resolves — so the failure to watch for is on the callback, not on the `await`.

## Interrupting the agent (Expressive, and Clips with fluent)

Interrupting needs a fluent stream (every Expressive (V4) session, or a Clips (V3) session that asked for {@link StreamOptions.fluent | fluent} and got it) and the agent's interrupt setting, which is on unless it was turned off in the agent's advanced settings. Two different questions decide whether to show a stop button and whether to enable it.

- {@link AgentManager.isInterruptAvailable | isInterruptAvailable()}: does this session support interrupting at all? Ask it after `connect()` resolves, to decide whether the control belongs on screen. Inside {@link AgentManagerCallbacks.onConnectionStateChange | onConnectionStateChange} the session is not attached yet, so it answers `false` there.
- {@link AgentManagerCallbacks.onInterruptibleChange | onInterruptibleChange}: is interrupting allowed *right now*? Expressive (V4) agents only. It goes `false` while any `blocking` tool call is outstanding and back to `true` when none is.

{@link AgentManager.interrupt | interrupt()} itself never throws. On every avatar type it returns without doing anything when interrupting is not available or not allowed right now, and on Talks (V2) and Clips (V3) agents when no video is playing.

```ts
import { type AgentManagerCallbacks } from '@d-id/client-sdk';

const callbacks: AgentManagerCallbacks = {
    onSrcObjectReady(value) {
        videoElement.srcObject = value;
    },
    onInterruptibleChange(interruptible) {
        setStopButtonEnabled(interruptible);
    },
};

// …create the manager with these callbacks, then:
await agentManager.connect();
setStopButtonVisible(agentManager.isInterruptAvailable());

stopButton.onclick = () => agentManager.interrupt();

// The user typed over the answer instead of pressing the button. Expressive (V4) agents
// drop `text` interrupts, because the orchestrator does not cancel the answer in flight.
composer.onInput = () => agentManager.interrupt({ type: 'text' });
```

The last message in the transcript is marked `interrupted` in the next {@link AgentManagerCallbacks.onNewMessage | onNewMessage}, but only when an interrupt was actually sent. A call that finds nothing to interrupt leaves the transcript untouched and fires no callback, so do not use the callback as an acknowledgement.

## Application messages on the data channel

{@link AgentManager.sendDataChannelMessage | sendDataChannelMessage()} sends a JSON payload to the agent on one of the topics in {@link DataChannelTopic}. The presentation topic, for instance, tells the agent which slide the user moved to in the deck it is presenting. Expressive (V4) agents only, after `connect()`.

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

Methods that add something reject; methods that remove something resolve, so teardown code needs no avatar-type guard.

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
| `getSttToken()` | works: it is not an Expressive-only method |

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
- {@link AgentManager.getStreamType | getStreamType()} and {@link StreamType}: fluent or legacy, which is what interrupting depends on.
- [Client tools](./client-tools.md): the other half of what an Expressive (V4) session can do.
