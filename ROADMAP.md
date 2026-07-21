# Grok Desk — Roadmap

**Current version:** 0.8.x  
**Current phase focus:** Phase 3 — Workspace (control surface shipped; chrome next)  
**Explicitly deferred:** GrokLink / phone remote commander (PC product first)

## Phase 0 — ACP spike ✅

- [x] Scaffold Tauri 2 + React + TS + Tailwind
- [x] Spawn `grok agent stdio`
- [x] Initialize + authenticate (cached token)
- [x] Create session on project cwd
- [x] Stream message / thought / tool updates
- [x] Permission cards (approve / deny)
- [x] Cancel turn
- [x] Fix doubled streaming text (duplicate listeners)
- [x] Fix tool reliability (agent-local FS/shell)

## Phase 1 — Mission control ✅

- [x] Multi-session sidebar (parallel open tabs on one agent process)
- [x] Per-session transcript / tools / permissions / busy state
- [x] Status chips (ready / running / needs permission)
- [x] Resume from `~/.grok/sessions` (`session/load` + recents list)
- [x] Lightweight markdown rendering for assistant replies
- [x] Session title from first prompt / disk summary
- [ ] OS notifications when a background session finishes (nice-to-have)
- [ ] Worktree-per-session toggle

## Phase 2 — Review loop ✅

- [x] Plan pane (ACP `plan` + `todo_write` checklist)
- [x] Plan mode indicator + Enter plan mode / Approve / Revise
- [x] Load `plan.md` from session disk when present
- [x] Diff pane (`git status` / `git diff` in session cwd)
- [x] Line comments on `+` lines → injected into next prompt
- [x] Thought/transcript caps to avoid webview OOM crashes
- [x] Real ACP plan approval (`x.ai/exit_plan_mode` handshake)
- [x] Auto Diff refresh after mutating tools (debounced)
- [x] Long prompt timeout (6h) — no more 5‑min freeze on Heavy runs
- [x] Stop unlocks UI immediately + stall banner with Unlock
- [x] Richer markdown, plan expand, image paste

## Phase 3 — Workspace ← **in progress**

Priority order is flexible; pick with the user:

- [x] Model + effort picker (`session/set_model` + `_meta.reasoningEffort`)
- [x] Permission modes (ask / always-approve per session tab — client auto-approve)
- [x] OS notifications when a background session finishes (and when a background tab needs permission)
- [ ] Embedded terminal (PTY in project cwd)
- [ ] File tree + open in external editor
- [ ] Slash command / skill palette (Tier 2)
- [ ] Richer tool / subagent / background-task presentation (Tier 2)

## Phase 4 — Ship loop

- [ ] Create PR via `gh`
- [ ] CI poll + auto-fix prompt
- [ ] Optional auto-merge when green

## Phase 5 — Quick Ask

- [ ] Global hotkey + floating panel
- [ ] Screenshot region → attach (Wayland/X11)

## Phase 6 — Preview

- [ ] Dev-server detection + browser/webview pane
- [ ] Screenshot verify loop via Grok vision

## Later / maybe

- [ ] GrokLink Remote Commander (phone control, pairing, E2EE) — **not** next
- [ ] Worktree-per-session toggle (also listed under Phase 1 nice-to-have)

## Non-goals (for now)

- Reimplementing the agent
- Official cloud remote sessions (self-host later)
- Computer use / desktop control
- Competing with grok.com chat chrome
