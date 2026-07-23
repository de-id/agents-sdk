# Migration Guide: v1 → v2

`@d-id/client-sdk` v2 is a **breaking** release. The biggest change is that
`Agent` is now the SDK's single, minimized runtime shape — the separate
`RuntimeAgent` type is gone, and the full agent-management API has been removed.

## Breaking: `Agent` is now the runtime shape

In v1, `Agent` was the full management entity and `RuntimeAgent` was a separate,
trimmed projection returned by `getRuntimeById`. In v2 they are unified: **`Agent`
_is_ the runtime projection.** `manager.agent` and `getAgent()` now return this
shape.

### Field mapping (v1 `Agent` → v2 `Agent`)

| v1 field               | v2 field                       | Notes                                               |
| ---------------------- | ------------------------------ | --------------------------------------------------- |
| `preview_name`         | `name`                         | renamed                                             |
| `preview_thumbnail`    | `thumbnail`                    | renamed                                             |
| `presenter`            | `avatar`                       | only `avatar.type` + `avatar.voice.language` remain |
| `presenter.idle_video` | `idle_video`                   | moved to top level                                  |
| `triggers` (object)    | `triggers_available` (boolean) | reduced to a boolean flag                           |

### Removed from the agent entirely

`llm`, `tools`, the agent prompt, the full `presenter` (`source_url`, driver/presenter
ids, full `voice` config, …), all `preview_*` fields, `status`, and `metadata`.

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

## Removed API

The full agent-management surface has been removed from `AgentsAPI`:

- `agents.create(...)`
- `agents.update(...)`
- `agents.getAgents(...)`
- `agents.getById(...)`
- the `AgentPayload` type and the old full-`Agent` type

Agent data is now fetched exclusively via **`getRuntimeById(id)`**, which
`createAgentManager` uses internally. The remaining `AgentsAPI` methods are:
`getRuntimeById`, `delete`, `newChat`, and `chat`.

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
