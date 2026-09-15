# Migration Guide: v2 → v3

`@d-id/client-sdk` v3 is a **breaking** release that cleans up the package's public surface so the generated API reference (https://sdk.d-id.com/) describes exactly what the SDK supports. Nothing about runtime behaviour changes.

## Implementation types are no longer exported

Around fifty internal types leaked from the package root in v2 through a wildcard export (RTC wire shapes such as `ICreateStreamRequestResponse`, streaming-manager options, knowledge entities the SDK never uses). They are not exported any more. If you imported one, you were depending on an implementation detail; the public equivalents are listed in the reference under Agent Manager, Callbacks & Events and Streaming Options.

Removed from the root: `AgentManagerItems`, `AgentsAPI`, `AnalyticsRTCStatsReport`, `AudioDetectionMetrics`, `AvSyncReport`, `AvSyncSample`, `ChatPayload`, `ChatProgress`, `ChatProgressCallback`, `ClipStreamOptions`, `CreateClipStreamRequest`, `CreateDocumentPayload`, `CreateRecordPayload`, `CreateSessionV2Options`, `CreateSessionV2Response`, `CreateStreamOptions`, `CreateTalkStreamRequest`, `DocumentData`, `DocumentStatus`, `DocumentType`, `IceCandidate`, `IceServer`, `ICreateStreamRequestResponse`, `IParserResult`, `KnowledgeData`, `KnowledgePayload`, `KnowledgeType`, `ManagerCallbackKeys`, `ManagerCallbacks`, `PayloadType`, `QueryResult`, `RatingPayload`, `RecordData`, `RpcMethodHandler`, `RtcApi`, `SendClipStreamPayload`, `SendTalkStreamPayload`, `SlimRTCStatsReport`, `Stream_LLM_Script`, `StreamEndUserData`, `StreamingManagerCallbacks`, `StreamingManagerOptions`, `StreamInterruptPayload`, `StreamScript`, `Subject`, `TalkStreamOptions`, `TransportProvider`, `TurnEventPayload`.

## `ManagerCallbacks` → `AgentManagerCallbacks`

The callbacks type accepted by `createAgentManager` was never exported in v2; the exported `ManagerCallbacks` was an unrelated internal type with a similar shape. Import `AgentManagerCallbacks` instead:

```ts
import type { AgentManagerCallbacks } from '@d-id/client-sdk';
```

## Renamed types

| v2 | v3 |
| --- | --- |
| `Stream_Text_Script` | `TextStreamScript` |
| `Stream_Audio_Script` | `AudioStreamScript` |
| `Elevenlabs_tts_provider` | `ElevenlabsTtsProvider` |
| `Afflorithmics_tts_provider` | `AfflorithmicsTtsProvider` |
| `Microsoft_tts_provider` | `MicrosoftTtsProvider` |
| `AzureOpenAi_tts_provider` | `AzureOpenAiTtsProvider` |
| `Amazon_tts_provider` | `AmazonTtsProvider` |
| `IRetrivalMetadata` | `RetrievalMetadata` |
| `IVoice` | `Voice` |

Shapes are unchanged; only the names differ.

## Removed options and types

- `AgentManagerOptions.enableAnalitics` (misspelled) — use `enableAnalytics`.
- `Subject` enum — the Knowledge API never served those prefixed values; use `DocumentStatus`.
- `VideoStateChangeCallback` no longer declares a second argument; the SDK never passed one.

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
