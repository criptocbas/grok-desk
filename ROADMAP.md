# Grok Desk — Roadmap

**Current version:** 0.9.x  
**Current phase focus:** Phase 3 nearly complete (workspace chrome shipped); next Phase 4 ship loop / Tier 2b / worktrees  
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
- [x] Pinned sessions (Desk bookmarks in `~/.config/grok-desk/pins.json`, auto-resume on Connect)
- [x] Session groups / folders (`session-groups.json`, collapsible in left nav)
- [x] Pin a group — auto-resume all member sessions on Connect
- [x] OS notifications when a background session finishes
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

## Phase 3.5 — Quiet polish ← **in progress**

Keep it simple yet extremely functional. No new surfaces until the default path feels calm.

- [x] Quieting: slim titlebar (About in Settings), collapsed session controls, de-duped Plan/Diff chips, composer hints only when empty
- [x] Re-thin (partial): `useGitDiff`, `useComposerDrafts`, `usePinsAndGroups`, `useLayoutChrome`
- [x] Re-thin: `useSessionStore` (session state + stream buffers + tab focus)
- [ ] Re-thin (remaining): `useSessionActions`, `useAcpBridge` (highest risk — extract last)
- [x] Heavy-run transcript hierarchy (tool groups + consecutive thought stacks)
- [x] Smoke checklist: `docs/SMOKE.md` + `docs/fixtures/`
- [ ] Docs freeze after remaining re-thin

## Phase 3 — Workspace ← **nearly complete**

Priority order is flexible; pick with the user:

- [x] Model + effort picker (`session/set_model` + `_meta.reasoningEffort`)
- [x] Permission modes (ask / always-approve per session tab — client auto-approve)
- [x] OS notifications when a background session finishes (and when a background tab needs permission)
- [x] Design system foundation (`src/DESIGN.md` + token ladder, density hooks)
- [x] Factor UI monolith (`App.tsx` → layout / chat / session components + `lib/*`)
- [x] Split LeftNavigator (`navigator/*` sections) + unified session titles
- [x] Three-surface shell: resizable utility rail (Plan · Diff · Activity · Settings)
- [x] Pin drag-reorder (wires `reorder_pins`)
- [x] Settings pane (theme / density / font / accent presets)
- [x] Workspace chrome: session tabs, empty states, Ctrl+K command palette, titlebar
- [x] Surface polish: structured permissions, transcript collapse, composer context strip
- [x] Surface polish: plan/diff refinement (progress, hunk collapse, keyboard file list)
- [x] A11y + progressive onboarding (ARIA live, palette focus trap, skippable coach marks)
- [x] Embedded terminal (human PTY in project cwd; bottom dock, Ctrl+`)
- [x] File tree + open in external editor (`list_project_dir` + opener; Alt+F)
- [x] Slash command / skill palette (ACP `available_commands_update` + composer `/`)
- [x] Richer tool / subagent / background-task presentation (Activity pane + task_* events)
- [x] First-class subagents: `subagent_spawned` / `subagent_finished`, Activity section, transcript cards, watching strip (Tier 1)
- [x] Subagent Tier 2a: click row → read-only detail panel (capped output + copy; no full child transcript)
- [x] Subagent Tier 2b lite: disk hydrate on resume (`list_session_subagents` + merge; lazy `read_subagent_output`); full child transcript still deferred
- [x] Desktop install (user-local `.desktop` for Super+Space) + in-app update check / rebuild

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
- [x] **Solana workhorse packaging (agent-first)** — docs, templates, workflows; **not** a Solana IDE UI  
      See [`docs/solana-workhorse/`](./docs/solana-workhorse/). Domain panes only if dogfood scorecard demands them.
- [ ] Solana domain UI experiment (gated) — cluster chip / IDL drawer **only** after dogfood ≥2 high-severity `domain-ui` items

## Non-goals (for now)

- Reimplementing the agent
- Official cloud remote sessions (self-host later)
- Computer use / desktop control
- Competing with grok.com chat chrome
- Solana wallet custody / in-app signing
- Forking Desk into a chain-specific IDE before generic terminal + file tree land
