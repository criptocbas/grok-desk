# Grok Desk

**Grok Build, with a desk.** A Linux-first desktop shell for the official Grok Build coding agent.

Not a reimplementation of the agent — a Tauri app that speaks [ACP](https://agentclientprotocol.com) to `grok agent stdio`.

![Phase 2](https://img.shields.io/badge/phase-2%20review%20loop-00a8ff)

## Features (v0.4)

- Connect to Grok Build (`grok agent stdio`) with SuperGrok Heavy
- **Multi-session mission control** — parallel tabs on one agent process
- Resume recent work from `~/.grok/sessions` (Recents)
- **Plan pane** — live checklist; Enter plan mode · Approve · Revise
- **Diff pane** — git status/diff in session cwd; click `+` lines to leave review notes
- Review notes inject into the next prompt automatically
- Stream chat / thoughts / tools (thoughts collapsed + size-capped to avoid freezes)
- Permission cards, cancel turn, light markdown

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
2. Set a project folder path
3. **New session here**
4. Prompt

## Project layout

```
grok-desk/
├── src/                 # React UI
├── src-tauri/           # Rust: ACP bridge + Tauri commands
├── ARCHITECTURE.md
├── ROADMAP.md
└── AGENTS.md
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md). Next: multi-session mission control, diffs, plan pane.

## Not affiliated with xAI

Independent client. Uses the public Grok Build CLI and ACP protocol.
