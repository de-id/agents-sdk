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
