# Migration Guide: v2 → v3

`@d-id/client-sdk` v3 is a **breaking** release that trims the package's public surface to what the SDK supports. The generated API reference at https://sdk.d-id.com/ describes exactly what is left, and every change is listed below.

## Implementation types are no longer exported

Around fifty internal types leaked from the package root in v2 through a wildcard export (RTC wire shapes such as `ICreateStreamRequestResponse`, streaming-manager options, knowledge entities the SDK never uses). They are not exported any more. If you imported one, you were depending on an implementation detail; the public equivalents are listed in the reference under Agent Manager, Callbacks & Events and Streaming Options.

Removed from the root, grouped by area:

- **Streaming transport (WebRTC / LiveKit wire types):** `ICreateStreamRequestResponse`, `IceCandidate`, `IceServer`, `CreateTalkStreamRequest`, `SendTalkStreamPayload`, `CreateClipStreamRequest`, `SendClipStreamPayload`, `TalkStreamOptions`, `ClipStreamOptions`, `CreateStreamOptions`, `PayloadType`, `StreamEndUserData`, `CreateSessionV2Options`, `CreateSessionV2Response`, `TransportProvider`, `RtcApi`
- **Streaming-manager internals:** `StreamingManagerCallbacks`, `ManagerCallbacks`, `ManagerCallbackKeys`, `StreamingManagerOptions`, `RpcMethodHandler`, `StreamInterruptPayload`, `TurnEventPayload`, `AudioDetectionMetrics`, `SlimRTCStatsReport`, `AnalyticsRTCStatsReport`, `AvSyncSample`, `AvSyncReport`, `AgentManagerItems`
- **Chat and agent API payloads:** `AgentsAPI`, `ChatPayload`, `ChatProgress`, `ChatProgressCallback`, `RatingPayload`, `StreamScript`, `Stream_LLM_Script`
- **Knowledge entities (the SDK has no knowledge methods):** `KnowledgeType`, `KnowledgeData`, `KnowledgePayload`, `DocumentType`, `DocumentStatus`, `DocumentData`, `CreateDocumentPayload`, `RecordData`, `CreateRecordPayload`, `IParserResult`, `QueryResult`, `Subject`

## ManagerCallbacks is now AgentManagerCallbacks

Import `AgentManagerCallbacks` instead of `ManagerCallbacks`:

```ts
import type { AgentManagerCallbacks } from '@d-id/client-sdk';
```

## Renamed types and methods

| v2                                       | v3                                    |
| ---------------------------------------- | ------------------------------------- |
| `Stream_Text_Script`                     | `TextStreamScript`                    |
| `Stream_Audio_Script`                    | `AudioStreamScript`                   |
| `Elevenlabs_tts_provider`                | `ElevenlabsTtsProvider`               |
| `Microsoft_tts_provider`                 | `MicrosoftTtsProvider`                |
| `AzureOpenAi_tts_provider`               | `AzureOpenAiTtsProvider`              |
| `Amazon_tts_provider`                    | `AmazonTtsProvider`                   |
| `VideoType`                              | `AvatarType`                          |
| `IRetrivalMetadata`                      | `RetrievalMetadata`                   |
| `IVoice`                                 | `Voice`                               |
| `PublicDataChannelTopic`                 | `DataChannelTopic`                    |
| `SendStreamPayloadResponse`              | `SpeakResponse`                       |
| `SupportedStreamScript`                  | `SpeakScript`                         |
| `StreamTextToSpeechProviders`            | `TtsProvider`                         |
| `RatingEntity`                           | `Rating`                              |
| `STTTokenResponse`                       | `SttTokenResponse`                    |
| `Interrupt`                              | `InterruptOptions`                    |
| `AgentManager.getIsInterruptAvailable()` | `AgentManager.isInterruptAvailable()` |
| `AgentManager.getSTTToken()`             | `AgentManager.getSttToken()`          |

Shapes are unchanged; only the names differ.

## Removed options and types

- `AgentManagerOptions.enableAnalytics`, `mixpanelKey` and `mixpanelAdditionalProperties` (and the misspelled `enableAnalitics`) — the three are one option now: `analytics: { enabled, mixpanelKey, additionalProperties }`. Defaults are unchanged, so `analytics` can be left out entirely; `externalId` stays top-level, because it is also the auth identity.
- `Subject` enum — the Knowledge API never served those prefixed values; it returns the bare status string (`'created' | 'processed' | 'done' | 'rejected' | 'error'`). The SDK exposes no knowledge methods — manage knowledge through the D-ID API.
- `Providers.Afflorithmics`, `Afflorithmics_tts_provider` and `VoiceConfigAfflorithmics` — the provider is no longer offered.
- `TextToSpeechProviders`, `ExtendedTextToSpeechProviders` and `mapVideoType` — unused; `speak()` takes `TtsProvider`.
- `HttpError.url` is now `HttpError.endpoint`, the same name `NetworkError` and `toJson()` use for the failing request's path.
- `DataChannelTopic` is a string enum instead of a const object with a derived type; `DataChannelTopic.Presentation` and its value are unchanged.
- `StreamOptions.outputResolution` — the Agents API ignores the field; the stream keeps the agent's configured resolution.
- `ConnectionStateChangeCallback` and `VideoStateChangeCallback` — use `AgentManagerCallbacks['onConnectionStateChange']` and `AgentManagerCallbacks['onVideoStateChange']`.
- `AgentManagerOptions.microphoneStream` — it was never read by the SDK, so passing it had no effect. Call `agentManager.publishMicrophoneStream(stream)` after `connect()` instead (Expressive (V4) agents).
- `StreamEvents` is no longer exported; `onToolEvent` receives a `ToolCallEvent` (`Started`, `Done`, `Error`) with the same string values.
- `StreamEvents.StreamCreated` — never emitted; use the `onStreamCreated` callback.
- `Status` and `StickyRequest` — their `status` and session-id fields are declared directly on `SpeakResponse`, as `status` and `sessionId`.
- `ToolEventPayload` — use the payload `onToolEvent` narrows to: `ToolCallStartedPayload`, `ToolCallDonePayload` or `ToolCallErrorPayload`.
- `BaseStreamScript` and `StreamScriptType` — deleted; use `SpeakScript`, or `TextStreamScript`/`AudioStreamScript` directly.
- `Chat` — no public method returns one; `onNewChat` reports the new chat's id.
- `RateState` — the SDK never produced or consumed it; `rate()` takes `1 | -1` and returns a `Rating`.
- `GetAuthParams` — a shape no SDK call accepts; declare it in your own code and pass an `Auth` to `createAgentManager`.
- `NetworkErrorMeta` — read `endpoint`, `method`, `durationMs`, `online` and `visibility` off the `NetworkError` instance.
- `Message.videoId` — never set by the SDK; read `ChatResponse.videoId` from the `chat()` result instead.
- `SDK_VERSION` — internal analytics value; no longer exported.
- Members and types marked `@internal` are stripped from the published `.d.ts`; none of them were supported.

## Behavior clarifications

- `createAgentManager()` no longer writes into the options object it is given: it does not replace your `callbacks.onError` with its analytics wrapper and does not set `debug` from the agent's `ui_debug_mode`. Two managers can share one options object, and handlers assigned to `callbacks` after creation are no longer picked up.
- Naming rule: shapes the SDK builds (`Message`, `SpeakResponse`, `StreamCreatedInfo`, the tool-call payloads, options) are camelCase; Agents API entities (`Agent`, `Rating`, `Voice`, the TTS provider objects) keep the API's snake_case field names.
- Every error subclass declares its `kind` as a literal, `HttpError` included; the Agents API's own classification moved to the new `HttpError.code` (and to `code` in `toJson()`), so `error.kind === 'InsufficientCreditsError'` becomes `error.code === 'InsufficientCreditsError'`.
- `isDIDError()` narrows to the new exported `DIDError` union instead of `BaseError`, so a `switch` on `kind` inside the branch now reaches `HttpError.status`, `ValidationError.key` and the other subclass fields, and an exhaustive `switch` leaves `never`.
- `ErrorJson`'s index signature is `unknown` instead of `any`, so a key it does not declare has to be narrowed before it is used; `code` is declared alongside `kind`, `message` and `cause`.
- `speak()` on Expressive (V4) agents now resolves with `{ status: 'success', duration: 0, videoId: '' }` instead of `undefined`, matching its declared type.
- The three `onToolEvent` payloads are camelCase like the rest of the SDK: `call_id` is now `callId`, `execution_mode` `executionMode`, `turn_id` `turnId` and `duration_ms` `durationMs`; only the documented fields are forwarded.
- `ToolCallStartedPayload.executionMode` is required (`'blocking'` when the server omits it) and `ToolCallStartedPayload.output` is optional.
- `ToolCallErrorPayload` carries the failure text as `error?: string`; `output` is typed `unknown` on the tool-call payloads — narrow it before use.
- `SpeakResponse` fields are camelCase: `sessionId`, `videoId` (`status` and `duration` are unchanged). The Agents API still answers in snake_case; the SDK converts.
- `StreamCreatedInfo` fields are camelCase: `agentId`, `sessionId`, `streamId`.
- `Message.created_at` is now `Message.createdAt`; the SDK sets it, and an `initialMessages` transcript restored from your own storage must use the new name.
- The five Expressive-only media methods are required members of `AgentManager` instead of optional; remove any `?.` guards.
- `Agent.avatar` is typed `AgentAvatar`, and its `type` is `` `${AvatarType}` `` — `AvatarType.Talk` and `'talk'` both compile and both narrow.
- `analytics.additionalProperties` and `enrichAnalytics()` are typed `Record<string, unknown>`; callers passing `Record<string, any>` are unaffected unless they rely on inference.
- `agentManager.getSttToken()` is now typed `Promise<SttTokenResponse>`; it never resolved `undefined` (a failed request throws `HttpError`).
- `interrupt()` never throws; where it used to throw on Talks (V2)/Clips (V3) streams it now returns silently, and the last message is marked `interrupted` only when an interrupt was actually sent. Its argument is optional and defaults to `{ type: 'click' }`, so a stop button can call `interrupt()`.
- `persistentChat` now defaults to `false` on Expressive (V4) agents too; v2 created those sessions with chat persistence on unless you passed `false`. Pass `persistentChat: true` to keep v2's behavior.
- `ChatMode.Off` and `ChatMode.DirectPlayback` are rejected with a `ValidationError` for Expressive (V4) agents; they were never supported there.
- `chat()` and `connect()` read the current mode, not the one `createAgentManager` was given; `changeMode()` may disconnect the session, so call `connect()` again when it did.
- `Message.parts` is optional, so `initialMessages` can be `{ id, role, content }` rows; every message the SDK delivers still has it set.
- The five Expressive-only media methods reject with a `ValidationError` instead of a plain `Error` when the session is a Talks (V2) or Clips (V3) one, or `connect()` has not run yet.
- `rate()`, `deleteRate()` and `submitFeedback()` are `async`: their `ValidationError` guard now rejects the returned promise instead of throwing synchronously, so `.catch()` sees it.
- `connect()` while a connect is in flight joins it; `connect()` on an open session rejects with a `ValidationError` — call `disconnect()` first. `reconnect()` rejects while a `connect()` is in flight.
- `disconnect()` no longer waits for an in-flight `connect()`; the connect tears down whatever it goes on to open.
- `changeMode()` now returns a `Promise` — it always was asynchronous (it disconnects the stream); await it, and catch `ValidationError` for unsupported modes.
- A `429` from the Agents API is now retried twice, one second apart, before it surfaces as an `HttpError`; in v2 the retry never fired.
- The TTS providers' `type`, `AgentAvatar.type` and the `topic` of `sendDataChannelMessage()` accept the enum member or its plain string (`{ type: 'elevenlabs' }` compiles). Assigning one to a variable annotated with the enum (`const t: AvatarType = agent.avatar.type`) no longer type-checks.
- `onError`'s second argument is a declared `ErrorContext` (`endpoint`, `method`, `sessionId`, `streamId`) instead of `Record<string, unknown>`: `errorData.url` is now `errorData.endpoint`; the request options, body and response headers are no longer passed.
- `submitFeedback(rating, answer?)` takes `1 | 2 | 3 | 4 | 5` instead of `number`, matching what the Agents API accepts and `rate()`'s `1 | -1`; a score computed as a `number` needs a narrow before it is passed.
- `AgentManager.agent` and `AgentManager.starterMessages` are `readonly`; `starterMessages` is a copy, so mutating it no longer changes the agent.
- `onSrcObjectReady` is optional in `TextOnly`, `Playground` and `Maintenance`; in every other mode `createAgentManager()` and `connect()` reject with a `ValidationError` when it is missing.
- `ClientToolHandler` may return `string` as well as `Promise<string>`; a synchronous handler no longer has to be marked `async`.
- `registerClientTool()` throws a `ValidationError` on a Talks (V2) or Clips (V3) agent; client tools are an Expressive (V4) feature. `unregisterClientTool()` stays a no-op.
- `AgentManager` gained `getChatMode()`, `getConnectionState()` and `getSessionInfo()`; a hand-written `AgentManager` double has to implement them.

---

# Migration Guide: v1 → v2

`@d-id/client-sdk` v2 is a **breaking** release. Two things change for consumers:
the agent object on the manager (`manager.agent`, typed `Agent`) is now a
minimized shape, and `speak()` stopped requiring a `provider`.

## The agent object is minimized

`manager.agent` (and the exported `Agent` type) now carries only the fields the
embedded widget needs — no `llm`, `tools`, prompt, or full `presenter`. If you
read fields off `manager.agent` or import the `Agent` type, update the names:

| v1 field               | v2 field                       | Notes                                               |
| ---------------------- | ------------------------------ | --------------------------------------------------- |
| `preview_name`         | `name`                         | renamed                                             |
| `preview_thumbnail`    | `thumbnail`                    | renamed                                             |
| `presenter`            | `avatar`                       | only `avatar.type` + `avatar.voice.language` remain |
| `presenter.idle_video` | `idle_video`                   | moved to top level                                  |
| `triggers` (object)    | `triggers_available` (boolean) | reduced to a boolean flag                           |

Removed from the agent entirely: `llm`, `tools`, the agent prompt, the full
`presenter` (`source_url`, driver/presenter ids, full `voice` config, …), all
`preview_*` fields, `status`, and `metadata`.

### The v2 Agent shape

```ts
interface Agent {
    id: string;
    owner_id?: string;
    name?: string;
    access?: 'public';
    thumbnail?: string;
    greetings?: string[];
    starter_message?: string[];
    idle_video?: string;
    knowledge?: { id: string; embedder?: { is_limited_language?: boolean } };
    avatar: { type: 'talk' | 'clip' | 'expressive'; voice?: { language?: string } };
    vision?: { enabled: boolean };
    end_of_call_feedback?: EndOfCallFeedbackConfig;
    triggers_available?: boolean;
    advanced_settings?: { ui_debug_mode?: boolean; vm_account_id?: string };
}
```

## speak() stopped requiring a provider

`provider` is optional on a text script: leave it out and the voice is resolved
server-side from the agent, pass one and the SDK forwards it as given.

```ts
manager.speak({ type: 'text', input: 'Hello' });
```

In v1 the `provider` was mandatory and had to be read off the agent:

```ts
manager.speak({ type: 'text', input: 'Hello', provider: agent.presenter.voice });
```
