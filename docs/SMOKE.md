# Grok Desk — smoke checklist

Manual regression script for Phase 3.5 work. Run the **fast gate** on every App/hooks change; run the matching subset after riskier PRs.

**Requires:** `grok` on PATH, cached auth (`~/.grok/auth.json`), `npm run tauri dev` (or installed Desk).

**Compile gate (every PR):**

```bash
npm run build          # tsc && vite build
# If Rust changed:
cd src-tauri && cargo check
```

Do **not** `cargo clean` lightly.

---

## Non-negotiables (never regress)

| Rule | Quick check |
|------|-------------|
| Client `fs` / `terminal` advertise **false** | Grep `acp.rs` / init capabilities |
| Plan approval is a real handshake | Enter plan → Approve once |
| `session/prompt` timeout ~6h | Do not shorten `request_with_timeout` |
| Cancel unlocks UI immediately | Stop mid-turn |
| Thought / transcript caps | Long Heavy run does not OOM webview |
| Model/effort via `session/set_model` | Chip still works |
| Permission mode Desk-side | always-approve auto-allows |
| Diff auto-refresh after mutating tools | Agent edits file → Diff updates |

---

## 6.A Fast gate (~5 min)

Use after any change that touches `App.tsx` or session hooks.

1. [ ] `npm run build` clean  
2. [ ] Connect agent → **New session** (temp or desk cwd)  
3. [ ] Short prompt: `reply with one word: pong` → streams OK  
4. [ ] Longer prompt → hit **Stop** → composer free immediately  
5. [ ] Open second session → type draft → switch tabs → draft restored  

**Fail → stop.** Revert or fix before stacking more work.

---

## 6.B Resume / stream (~5 min)

Use after `useSessionStore`, `useSessionActions`, `useAcpBridge`, or subagent hydrate.

1. [ ] Resume a **multi-turn** disk session (Recents)  
2. [ ] User messages are **separate bubbles** (not one glued block)  
3. [ ] Send a new message → new turn streams cleanly  
4. [ ] Thoughts still appear and stay capped  

---

## 6.C Control plane (~5 min)

Use after prompt/permission/plan moves (`useSessionActions`, bridge).

1. [ ] Enter plan mode → Plan pane fills  
2. [ ] **Approve** plan once (agent continues; no hang)  
3. [ ] Permission **default**: tool card → Allow works  
4. [ ] **always-approve**: tool does not block on card  
5. [ ] Change model or effort via session chip  

---

## 6.D Subagents / Heavy (~10 min)

Use after hierarchy polish, hydrate (2b), or ACP bridge extract.

1. [ ] Prompt that spawns ≥1 subagent (or known Heavy workflow)  
2. [ ] **Activity → Subagents**: named row, type/status/duration  
3. [ ] Finish → status not stuck **running**; watching strip clears  
4. [ ] Click row → Tier 2a detail (capped output)  
5. [ ] Transcript: consecutive tools grouped; **live** group still visible  
6. [ ] **After hydrate (2b):** fully quit Desk, resume same parent → historical subagents listed in Activity  
7. [ ] After resume of finished children: watching strip **off** (no fake running)  

---

## 6.E Regression anchors (before docs freeze / release)

1. [ ] Agent edits a tracked file → Diff pane refreshes  
2. [ ] Pin a session → Connect restores it  
3. [ ] Terminal dock (`Ctrl+\``) still opens in project cwd  
4. [ ] File tree (`Alt+F`) lists project files  
5. [ ] Palette (`Ctrl+K`) still works  
6. [ ] Light theme: readable chips / banners  

---

## Suggested PR mapping

| Work | Smoke subsets |
|------|----------------|
| PR-0 harness only | Compile only |
| `useSessionStore` | A + B |
| Heavy hierarchy | A + D (1–5) |
| Subagent disk hydrate | A + B + D (full) |
| `useSessionActions` | A + B + C |
| `useAcpBridge` | A–D full |
| Docs freeze | E + skim A |

---

## Failure policy

1. **Stop stacking** commits on a red smoke.  
2. Prefer **`git revert`** of the last risk PR over drive-by “fixes” that mix concerns.  
3. Re-run the subset that failed after the fix.  
4. If resume user bubbles glue again, check `streamBuf.userTurnOpen` / `clearStreamTurn` / `turn_completed` first.

---

## Fixtures

Sample ACP / disk shapes (anonymized) live under [`docs/fixtures/`](./fixtures/). Use them when implementing pure parsers (`activity.ts`) or when replaying mental models — they are **not** a full automated suite.
