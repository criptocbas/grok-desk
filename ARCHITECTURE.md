# Grok Desk — Architecture

Grok Desk is a **desktop shell** around the official Grok Build agent. It does not reimplement tools, models, or agent logic.

```
┌─────────────────────────────────────────┐
│  Grok Desk (Tauri 2 + React + TS)       │
│  sessions · chat · tools · permissions  │
└──────────────────┬──────────────────────┘
                   │ JSON-RPC (ACP) over stdio
                   ▼
            grok agent stdio
         (Grok Build on PATH)
```

## Principles

1. **CLI is the engine** — spawn `grok agent stdio`; never fork the agent loop.
2. **Local sessions stay local** — Grok's `~/.grok` store remains source of truth (resume/list in later phases).
3. **UI owns presentation** — stream updates become chat / tool / plan panes; agent owns file edits.
4. **Permissions are first-class** — every `session/request_permission` becomes a card with options.

## Process model (v0.1)

- One `grok agent stdio` process per app connection.
- One active ACP session at a time (multi-session is Phase 1).
- Initialize → authenticate (`cached_token` from `~/.grok/auth.json`) → `session/new`.

## Events (Tauri)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `acp://session-update` | agent → UI | message/thought/tool/plan chunks |
| `acp://permission` | agent → UI | tool approval needed |
| `acp://status` | bridge → UI | running / stopped |
| `acp://stderr` | agent → UI | diagnostics |

## Commands (Rust → frontend)

| Command | Action |
|---------|--------|
| `grok_status` | Is `grok` on PATH? |
| `agent_start` / `agent_stop` | Spawn / kill agent |
| `session_new` | `session/new` with cwd |
| `session_prompt` | `session/prompt` (awaits turn end) |
| `session_cancel` | `session/cancel` |
| `permission_respond` | Answer permission request |

## Key files

| Path | Role |
|------|------|
| `src-tauri/src/acp.rs` | ACP JSON-RPC client |
| `src-tauri/src/lib.rs` | Tauri commands + state |
| `src/App.tsx` | Phase 0 UI |

## Reference

- Grok Build docs: `grok-build/crates/codegen/xai-grok-shell/README.md`
- ACP agent mode: `.../xai-grok-pager/docs/user-guide/15-agent-mode.md`
- Protocol: https://agentclientprotocol.com
