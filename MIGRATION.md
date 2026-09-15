# Migration Guide: v2 → v3

`@d-id/client-sdk` v3 is a **breaking** release that cleans up the package's public surface so the generated API reference (https://sdk.d-id.com/) describes exactly what the SDK supports. Every change is listed below.

## Implementation types are no longer exported

Around fifty internal types leaked from the package root in v2 through a wildcard export (RTC wire shapes such as `ICreateStreamRequestResponse`, streaming-manager options, knowledge entities the SDK never uses). They are not exported any more. If you imported one, you were depending on an implementation detail; the public equivalents are listed in the reference under Agent Manager, Callbacks & Events and Streaming Options.

Removed from the root, grouped by area:

- **Streaming transport (WebRTC / LiveKit wire types):** `ICreateStreamRequestResponse`, `IceCandidate`, `IceServer`, `CreateTalkStreamRequest`, `SendTalkStreamPayload`, `CreateClipStreamRequest`, `SendClipStreamPayload`, `TalkStreamOptions`, `ClipStreamOptions`, `CreateStreamOptions`, `PayloadType`, `StreamEndUserData`, `CreateSessionV2Options`, `CreateSessionV2Response`, `TransportProvider`, `RtcApi`
- **Streaming-manager internals:** `StreamingManagerCallbacks`, `ManagerCallbacks`, `ManagerCallbackKeys`, `StreamingManagerOptions`, `RpcMethodHandler`, `StreamInterruptPayload`, `TurnEventPayload`, `AudioDetectionMetrics`, `SlimRTCStatsReport`, `AnalyticsRTCStatsReport`, `AvSyncSample`, `AvSyncReport`, `AgentManagerItems`
- **Chat and agent API payloads:** `AgentsAPI`, `ChatPayload`, `ChatProgress`, `ChatProgressCallback`, `RatingPayload`, `StreamScript`, `Stream_LLM_Script`
- **Knowledge entities (the SDK has no knowledge methods):** `KnowledgeType`, `KnowledgeData`, `KnowledgePayload`, `DocumentType`, `DocumentStatus`, `DocumentData`, `CreateDocumentPayload`, `RecordData`, `CreateRecordPayload`, `IParserResult`, `QueryResult`, `Subject`

## `ManagerCallbacks` → `AgentManagerCallbacks`

Import `AgentManagerCallbacks` instead of `ManagerCallbacks`:

```ts
import type { AgentManagerCallbacks } from '@d-id/client-sdk';
```

## Renamed types

| v2                         | v3                       |
| -------------------------- | ------------------------ |
| `Stream_Text_Script`       | `TextStreamScript`       |
| `Stream_Audio_Script`      | `AudioStreamScript`      |
| `Elevenlabs_tts_provider`  | `ElevenlabsTtsProvider`  |
| `Microsoft_tts_provider`   | `MicrosoftTtsProvider`   |
| `AzureOpenAi_tts_provider` | `AzureOpenAiTtsProvider` |
| `Amazon_tts_provider`      | `AmazonTtsProvider`      |
| `IRetrivalMetadata`        | `RetrievalMetadata`      |
| `IVoice`                   | `Voice`                  |

Shapes are unchanged; only the names differ.

## Removed options and types

- `AgentManagerOptions.enableAnalitics` (misspelled) — use `enableAnalytics`. The misspelled key is ignored in v3.
- `Subject` enum — the Knowledge API never served those prefixed values; it returns the bare status string (`'created' | 'processed' | 'done' | 'rejected' | 'error'`). The SDK exposes no knowledge methods — manage knowledge through the D-ID API. (also deleted from the source, not just unexported)
- `Providers.Afflorithmics`, `AfflorithmicsTtsProvider` and `VoiceConfigAfflorithmics` — the provider is no longer offered.
- `AgentManagerOptions.microphoneStream` — it was never read by the SDK, so passing it had no effect. Call `agentManager.publishMicrophoneStream(stream)` after `connect()` instead (Expressive (V4) agents).
- The Expressive-only media methods (`publishMicrophoneStream`, `unpublishMicrophoneStream`, `replaceMicrophoneTrack`, `publishCameraStream`, `unpublishCameraStream`) are now required members of `AgentManager` instead of optional. They always existed at runtime; on Talks (V2) and Clips (V3) agents the `publish`/`replace` methods reject and the `unpublish` methods resolve without effect. Remove any `?.` guards.
- `StreamEvents.StreamCreated` — never emitted; use the `onStreamCreated` callback.

## Behaviour clarifications

- `speak()` on Expressive (V4) agents now resolves with `{ status: 'success', duration: 0, video_id: '' }` instead of `undefined`, matching its declared type.

---

# Migration Guide: v1 → v2

`@d-id/client-sdk` v2 is a **breaking** release. Two things change for consumers:
the agent object on the manager (`manager.agent`, typed `Agent`) is now a
minimized shape, and `speak()` no longer takes a `provider`.

## `manager.agent` is minimized

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

### v2 `Agent` shape

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

## `speak()` no longer takes a `provider`

`speak()` no longer accepts or sends a `provider` — voice is now server-driven
(resolved from the agent). Remove any `provider` you previously passed in the
speak script.

**Before**

```ts
manager.speak({ type: 'text', input: 'Hello', provider: agent.presenter.voice });
```

**After**

```ts
manager.speak({ type: 'text', input: 'Hello' });
```
