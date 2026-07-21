# Grok Desk

**Grok Build, with a desk.** A Linux-first desktop shell for the official Grok Build coding agent.

Not a reimplementation of the agent — a Tauri app that speaks [ACP](https://agentclientprotocol.com) to `grok agent stdio`.

![Phase 3](https://img.shields.io/badge/phase-3%20workspace-00a8ff)
![v0.9](https://img.shields.io/badge/version-0.9-blue)

## Features (v0.9)

- Connect to Grok Build (`grok agent stdio`) with SuperGrok Heavy (via CLI cached auth)
- **Multi-session mission control** — parallel tabs on one agent process
- Resume recent work from `~/.grok/sessions` (Recents)
- **Model + effort pickers** — per-session via ACP `session/set_model`
- **Permission modes** — Ask vs Always-approve per tab (auto-allows tool prompts)
- **OS notifications** when a background tab finishes a turn or needs permission
- **Slash / skill palette** — type `/` to browse agent commands and skills
- **Activity feed** — running tools, subagents, background tasks with durations
- **Plan pane** — live checklist; Enter plan mode · Approve · Revise (real `exit_plan_mode` handshake)
- **Diff pane** — git status/diff; auto-refresh after file-mutating tools; click `+` lines for review notes
- Review notes inject into the next prompt automatically
- Stream chat / thoughts / tools (thoughts collapsed + size-capped)
- Image paste into prompts; rich markdown for assistant replies
- Permission cards, **Stop unlocks UI**, stall recovery banner on long quiet periods
- Long agent turns supported (prompt RPC wait is hours, not 5 minutes)

## Requirements

- [Grok Build](https://x.ai/cli) installed (`grok` on PATH)
- SuperGrok / Premium account (same as CLI)
- Node.js 20+
- Rust (stable)
- Linux: WebKitGTK 4.1 (`webkit2gtk-4.1`)

```bash
# Arch / Omarchy example
# pacman -S webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg
```

## Quick start

```bash
cd grok-desk
npm install
npm run tauri dev
```

1. Click **Connect to Grok**
2. Pick a project folder (`…`)
3. **+ New session**
4. Prompt

## Project layout

```
grok-desk/
├── src/                 # React UI
├── src-tauri/           # Rust: ACP bridge + Tauri commands
├── ARCHITECTURE.md
├── ROADMAP.md
└── AGENTS.md            # Instructions for coding agents working on this repo
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md). **Phases 0–2 done.** Phase 3 control surface shipped (model/effort/permission modes/notifications); next: terminal, file tree, ship loop.

**Deferred:** phone remote / GrokLink — build the PC product first.

## Not affiliated with xAI

Independent client. Uses the public Grok Build CLI and ACP protocol.
