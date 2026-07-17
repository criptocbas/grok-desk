# Grok Desk — Roadmap

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

## Phase 1 — Mission control ✅ (current)

- [x] Multi-session sidebar (parallel open tabs on one agent process)
- [x] Per-session transcript / tools / permissions / busy state
- [x] Status chips (ready / running / needs permission)
- [x] Resume from `~/.grok/sessions` (`session/load` + recents list)
- [x] Lightweight markdown rendering for assistant replies
- [x] Session title from first prompt / disk summary
- [ ] OS notifications when a background session finishes (nice-to-have)
- [ ] Worktree-per-session toggle

## Phase 2 — Review loop

- [ ] Diff pane (`git status` / `git diff` / worktree)
- [ ] Line comments → injected into next prompt
- [ ] Plan pane (ACP plan updates as structured checklist)

## Phase 3 — Workspace

- [ ] Embedded terminal (PTY in project cwd)
- [ ] File tree + open in external editor
- [ ] Permission modes (ask / always-approve)
- [ ] Model + effort picker

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

## Non-goals (for now)

- Reimplementing the agent
- Official cloud remote sessions (self-host later)
- Computer use / desktop control
- Competing with grok.com chat chrome
