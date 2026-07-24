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
- **Activity feed** — first-class subagents (`subagent_spawned` / `finished`), tools, and background tasks with durations
- **Watching strip** — stays visible when child agents or bg tasks run after the parent turn ends
- **Pinned sessions** — bookmark conversations; auto-resume on Connect after restart
- **Plan pane** — live checklist; Enter plan mode · Approve · Revise (real `exit_plan_mode` handshake)
- **Diff pane** — git status/diff; auto-refresh after file-mutating tools; click `+` lines for review notes
- Review notes inject into the next prompt automatically
- Stream chat / thoughts / tools (thoughts collapsed + size-capped)
- Image paste into prompts; rich markdown for assistant replies
- Permission cards, **Stop unlocks UI**, stall recovery banner on long quiet periods
- Long agent turns supported (prompt RPC wait is hours, not 5 minutes)
- **Project terminal** — bottom dock shell in session cwd (`Ctrl+\``); human PTY only, not agent tools
- **Session tabs** — horizontal strip for open sessions with status dots
- **File tree** — browse project (`Alt+F`); open files in your external editor
- **Command palette** — `Ctrl+K` for sessions, panels, plan, perms, and more

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

## Quick start (dev)

```bash
cd grok-desk
npm install
npm run tauri dev
```

1. Click **Connect to Grok**
2. Pick a project folder (`…`)
3. **+ New session**
4. Prompt

## Install as a desktop app (Omarchy / Super+Space)

User-local install — no root. Binary + `.desktop` entry so Walker/Super+Space finds **Grok Desk**.

```bash
# From the repo checkout
npm run install:local
# or: ./scripts/install-local.sh
```

Installs to:

| What | Where |
|------|--------|
| Binary | `~/.local/bin/grok-desk` |
| Desktop entry | `~/.local/share/applications/app.grokdesk.desktop` |
| Install meta | `~/.local/share/grok-desk/install-meta.json` |

### Updates

- **In-app:** Settings → App & updates → *Check for updates* / *Update now* (pulls `main`, rebuilds, reinstalls in the background). Or use the top banner when a newer commit is on GitHub.
- **CLI:** `npm run update:local` or `./scripts/install-local.sh --update`

Requires the original git checkout path (stored in install-meta) and network for `git pull` + GitHub commit check.

## Project layout

```
grok-desk/
├── src/                 # React UI
├── src-tauri/           # Rust: ACP bridge + Tauri commands
├── docs/solana-workhorse/  # Agent-first Solana packaging (no domain UI)
├── templates/solana/    # AGENTS.md + dogfood kits for Solana repos
├── .grok/workflows/     # solana-security-pass, solana-test-matrix, idl-client-sync
├── ARCHITECTURE.md
├── ROADMAP.md
└── AGENTS.md            # Instructions for coding agents working on this repo
```

## Solana workhorse (agent-first)

Desk is not a Solana IDE fork. Strong multi-session + plan/diff/activity, plus skills and workflows, is enough for blockchain work.

See **[docs/solana-workhorse/](./docs/solana-workhorse/)** for inventory, dogfood kit, profile, MCP notes, and upgrade ranking. Copy [`templates/solana/AGENTS.md`](./templates/solana/AGENTS.md) into Solana repos; workflows live under [`.grok/workflows/`](./.grok/workflows/).

## Roadmap

See [ROADMAP.md](./ROADMAP.md). **Phases 0–2 done.** Phase 3 control surface shipped (model/effort/permission modes/notifications); next: terminal, file tree, ship loop.

**Deferred:** phone remote / GrokLink — build the PC product first.

## Not affiliated with xAI

Independent client. Uses the public Grok Build CLI and ACP protocol.
