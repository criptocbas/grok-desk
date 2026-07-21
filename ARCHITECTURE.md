# Grok Desk — Architecture

Grok Desk is a **desktop shell** around the official Grok Build agent. It does not reimplement tools, models, or agent logic.

```
┌─────────────────────────────────────────┐
│  Grok Desk (Tauri 2 + React + TS)       │
│  sessions · chat · plan · diff · perms  │
└──────────────────┬──────────────────────┘
                   │ JSON-RPC (ACP) over stdio
                   ▼
            grok agent stdio
         (Grok Build on PATH)
```

## Principles

1. **CLI is the engine** — spawn `grok agent stdio`; never fork the agent loop.
2. **Local sessions stay local** — Grok's `~/.grok` store remains source of truth for resume/list.
3. **UI owns presentation** — stream updates become chat / tool / plan / diff panes; agent owns file edits.
4. **Permissions are first-class** — every `session/request_permission` becomes a card with options.
5. **Plan approval is a reverse RPC** — `x.ai/exit_plan_mode` must be answered or the agent hangs.

## Process model (v0.9)

- One `grok agent stdio` process per app connection.
- One agent process can host **many** ACP sessions (`session/new` / `session/load`).
- UI routes `session/update` by `sessionId` into per-tab transcripts.
- Initialize → authenticate (`cached_token` from `~/.grok/auth.json`) → sessions.
- **Prompt RPC timeout is 6 hours** (`request_with_timeout` in `acp.rs`). Control-plane RPCs use ~120s.
- **Cancel** sends `session/cancel` and clears UI `busy` immediately (agent may still finish the current tool).
- **Model / effort** via ACP `session/set_model` (optional `_meta.reasoningEffort`). Catalog from `session/new` / initialize `_meta.modelState`.
- **Permission mode** is a Desk per-tab policy: `always-approve` auto-answers `session/request_permission` with an allow option (agent still enforces deny rules/hooks).
- **Background notifications** via `notify-send` when a non-active tab finishes a turn or needs permission.
- **Activity feed** derives from `tool_call` / `tool_call_update` plus Grok extensions `task_backgrounded` / `task_completed` (and defensive `turn_completed`). Caps tool history; never stores full terminal logs in the UI.
- **Pinned sessions** are Desk UI bookmarks (not Grok session storage). Content still resumes via `session/load` from `~/.grok/sessions`.

### Client capabilities (tools)

We intentionally advertise **no** client `fs` / `terminal` capabilities:

```json
"clientCapabilities": {
  "fs": { "readTextFile": false, "writeTextFile": false },
  "terminal": false
}
```

When those flags are `true`, Grok routes `read_file` / shell through ACP methods
on the desktop client. Early stubs returned the wrong read shape and left
terminal unimplemented, so tools failed even though the agent was healthy.

With fs/terminal off, tools run **inside the agent process on local disk/shell**
— same path as the TUI. Correct for a co-located desktop shell.

Handlers for `fs/*` still exist (with the correct `content` field) for a future
mode that wants client-side FS (e.g. unsaved editor buffers).

## Events (Tauri)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `acp://session-update` | agent → UI | message/thought/tool/plan chunks |
| `acp://permission` | agent → UI | tool approval needed |
| `acp://plan-approval` | agent → UI | `exit_plan_mode` waiting for user |
| `acp://status` | bridge → UI | running / stopped |
| `acp://stderr` | agent → UI | diagnostics |

## Commands (Rust → frontend)

| Command | Action |
|---------|--------|
| `grok_status` | Is `grok` on PATH? |
| `agent_start` / `agent_stop` | Spawn / kill agent |
| `session_new` | `session/new` with cwd |
| `session_load` | `session/load` (replay history) |
| `session_prompt` | `session/prompt` (sessionId + text) |
| `session_prompt_with_images` | prompt + image/resource blocks |
| `session_cancel` | `session/cancel` (sessionId) |
| `session_set_model` | `session/set_model` (+ optional reasoning effort) |
| `list_disk_sessions` | Scan `~/.grok/sessions/**/summary.json` |
| `permission_respond` | Answer permission request |
| `plan_approval_respond` | Answer `exit_plan_mode` (approved/cancelled/abandoned) |
| `read_plan_doc` | Load session `plan.md` if present |
| `git_status` / `git_diff` | Working tree for Diff pane |
| `default_cwd` | Sensible starting folder |
| `show_notification` | OS notification (`notify-send` on Linux) |
| `list_pins` / `pin_session` / `unpin_session` / `reorder_pins` | Desk pin bookmarks (`~/.config/grok-desk/pins.json`) |
| `set_session_title` / `get_session_title` | Custom session names (`~/.config/grok-desk/session-titles.json`) |
| `list_session_groups` / create / rename / delete / set membership | Session folders (`~/.config/grok-desk/session-groups.json`) |

## UI reliability (frontend)

| Mechanism | Why |
|-----------|-----|
| Thought / transcript caps | Prevent webview OOM on long Heavy runs |
| Debounced git refresh after mutating tools | Diff stays live mid-turn |
| Stall banner (~90s no ACP traffic) | Recover from “looks frozen” without waiting for RPC end |
| Timeout messaging | If wait ends, remind user agent may still have written files |

## UI layout (presentation)

```
Titlebar
LeftNavigator | Workbench (chrome · transcript · composer) | Utility rail
  pins · open · project                         Plan | Diff | Activity | Settings
                                                (resizable, width in localStorage)
```

- **Design tokens:** `src/index.css` + `src/DESIGN.md` (surface ladder, accent, density).
- **App.tsx** wires ACP session state and composes layout components — keep it orchestration-only.
- Caps, stall detection, plan approval, and git auto-refresh live in App/hooks — not reimplemented in panes.
- **UI prefs:** `grok-desk.prefs.v1` (theme/density/accent), `grok-desk.layout.v1` (utility width).

## Key files

| Path | Role |
|------|------|
| `src-tauri/src/acp.rs` | ACP JSON-RPC client + timeouts + plan approval |
| `src-tauri/src/git.rs` | git status / unified diff |
| `src-tauri/src/lib.rs` | Tauri commands + state |
| `src/App.tsx` | Session store + ACP listeners + composition |
| `src/DESIGN.md` | Design system (visual contracts) |
| `src/lib/*` | Pure helpers (caps, format, plan parse, agent helpers) |
| `src/components/layout/*` | Titlebar, LeftNavigator, EmptyWorkbench |
| `src/components/chat/*` | Transcript bubbles, composer, stall/permission banners |
| `src/components/session/*` | Session chrome (model/effort/perms) |
| `src/components/PlanPane.tsx` | Plan checklist + approval actions |
| `src/components/DiffPane.tsx` | Diff + line comments |
| `src/components/ActivityPane.tsx` | Tools / background tasks |
| `src/components/RichText.tsx` | Assistant markdown |

## Reference

- Grok Build docs: local install under `~/.grok` / xAI CLI docs
- Protocol: https://agentclientprotocol.com
- Product roadmap: `ROADMAP.md`
- Agent instructions: `AGENTS.md`
