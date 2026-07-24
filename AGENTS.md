# AGENTS.md — Grok Desk

## What this is

Desktop shell for Grok Build. UI in React/Tauri; agent runtime is the official `grok` CLI via ACP (`grok agent stdio`). SuperGrok Heavy works through `~/.grok/auth.json` (`cached_token`).

**Version:** 0.9.x · **Phases 0–2 complete** · Phase 3 control, activity feed, pins — see `ROADMAP.md`.

## Rules

1. **Never reimplement the agent.** All coding work goes through `grok agent stdio` or documented ACP methods.
2. Prefer extending `src-tauri/src/acp.rs` for protocol changes; keep `App.tsx` presentation-only when possible.
3. Do not commit secrets or dump `~/.grok/auth.json`.
4. Phase scope lives in `ROADMAP.md` — finish the current phase before expanding.
5. After ACP protocol changes, smoke-test with a real `session/prompt` against a temp directory.
6. **Do not build GrokLink / phone remote** unless the user explicitly asks — deferred; PC product first.
7. **Never `cargo clean` lightly** if that would discard identity you care about; prefer targeted rebuilds.
8. Avoid approving long self-edit plans that rewrite Desk from inside Desk without a clear scope (past OOM/crash risk on huge thought streams — caps exist but keep turns bounded).

## Critical ACP / reliability notes (do not regress)

| Topic | Correct behavior |
|--------|------------------|
| Client `fs` / `terminal` | Advertise **false**. Agent uses local tools. Enabling client FS broke `read_file` historically. |
| Plan approval | Real handshake: agent reverse-request `x.ai/exit_plan_mode` → UI Approve/Revise/Abandon → `plan_approval_respond`. |
| `session/prompt` wait | **Long timeout (6h)** in `acp.rs` — not 5 minutes. Short waits cause false "request timed out" mid Heavy runs. |
| Diff pane | Auto-refresh (debounced) after mutating tools (`write`, `search_replace`, terminal, …); manual Refresh still available. |
| Stop / stall | Cancel unlocks UI immediately; ~90s silence shows stall banner (Stop / Unlock UI / Refresh diffs). |
| Thoughts | Hard-capped in UI (`MAX_THOUGHT_CHARS`) — unbounded streams OOM the webview. |
| Model / effort | Prefer `session/set_model` (+ `_meta.reasoningEffort`); do not reimplement model routing. |
| Permission mode | Desk-side per tab; `always-approve` auto-answers allow options — never flip client `fs`/`terminal` to “fix” permissions. |

## Commands

```bash
# Frontend only
npm run dev

# Full desktop app
npm run tauri dev

# Production build
npm run tauri build
```

Requires: Rust, Node 20+, system WebKitGTK (Linux), `grok` on PATH.

## Layout

```
src/App.tsx                      # Orchestration: sessions, ACP listeners, compose shell
src/DESIGN.md                    # Design system (tokens, density, a11y)
src/lib/                         # Pure helpers (caps, format, plan parse)
src/components/layout/           # Titlebar, LeftNavigator, EmptyWorkbench, CoachMarks
src/components/layout/navigator/ # Pins / Open / Recents / SessionRow (split from LeftNavigator)
src/components/chat/             # Composer, bubbles, stall/permission banners
src/components/session/          # Session chrome, tab strip (model/effort/perms)
src/components/files/            # Project file tree (open externally)
src/lib/sessionStatus.ts         # Shared session status for tabs / navigator
src/lib/sessionTitle.ts          # One display name across tabs, pins, chrome
src/components/PlanPane.tsx
src/components/DiffPane.tsx
src/components/ActivityPane.tsx
src/components/RichText.tsx
src-tauri/src/acp.rs             # ACP JSON-RPC bridge
src-tauri/src/git.rs             # git status / diff for Diff pane
src-tauri/src/lib.rs             # Tauri commands
```

**UI structure rule:** Prefer new surfaces under `components/{layout,chat,session,command}/`. Do not re-monolith `App.tsx`. Prefer hooks under `src/hooks/` (e.g. `useGitDiff`) for state clusters. Keep caps, stall recovery, and plan-approval wiring intact when extracting.

**Quiet default:** Titlebar = app/agent only. Session model/effort/perms collapse behind one chip. Don't mirror Plan/Diff badges when that rail tab is open.

## Docs for agents

| File | Use for |
|------|---------|
| `ROADMAP.md` | What's done vs next phase |
| `ARCHITECTURE.md` | Process model, events, commands, UI layout |
| `docs/SMOKE.md` | Manual regression checklist after App/hooks/ACP changes |
| `src/DESIGN.md` | Visual system (tokens, density, what not to do) |
| `README.md` | User-facing features + quick start |
| `docs/solana-workhorse/` | Solana as agent-first packaging (not Desk domain UI) |
| `templates/solana/` | Copy into Solana repos (`AGENTS.md`, dogfood kits) |

## Suggested first turn in a new session

Orient only: read `ROADMAP.md` + recent commits; propose 2–3 Phase 3 options; **wait for user pick** before implementing.
