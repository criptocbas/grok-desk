# AGENTS.md — Grok Desk

## What this is

Desktop shell for Grok Build. UI in React/Tauri; agent runtime is the official `grok` CLI via ACP.

## Rules

1. **Never reimplement the agent.** All coding work goes through `grok agent stdio` or documented ACP methods.
2. Prefer extending `src-tauri/src/acp.rs` for protocol changes; keep `App.tsx` presentation-only when possible.
3. Do not commit secrets or dump `~/.grok/auth.json`.
4. Phase scope lives in `ROADMAP.md` — finish the current phase before expanding.
5. After ACP protocol changes, smoke-test with a real `session/prompt` against a temp directory.

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

## Architecture

See `ARCHITECTURE.md`.
