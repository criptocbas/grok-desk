# Implementation log

**Date:** 2026-07-22  
**Scope:** Plan phases 1–4 packaging + 6 metrics (no Desk UI code, no domain panes)

## Shipped

| Item | Location |
|------|----------|
| Inventory snapshot | `01-inventory.md` |
| Dogfood guide | `02-dogfood.md` |
| Profile / habits | `03-profile.md` |
| MCP shortlist | `04-mcp-shortlist.md` |
| Desk upgrade ranking | `05-desk-upgrades.md` |
| Metrics / stop conditions | `06-metrics.md` |
| Project `AGENTS.md` template | `templates/solana/AGENTS.md` |
| Grok config example | `templates/solana/solana-profile.toml.example` |
| Friction diary + scorecard | `templates/solana/dogfood-*.md` |
| Workflows (project) | `.grok/workflows/*.rhai` |
| Workflows (user copy) | `~/.grok/workflows/*.rhai` |
| README / ROADMAP / AGENTS links | repo root docs |

## Workflow smoke checks

`validate_only: true` against user copies under `~/.grok/workflows/`:

| Workflow | Result |
|----------|--------|
| `solana-security-pass` | Pass (canned path; live scan not run) |
| `solana-test-matrix` | Pass (canned path; no real tests run) |
| `idl-client-sync` | Pass (canned path) |

Project-path validation requires folder trust for this repo; user-global copies are invocable without project trust.

## Not shipped (by design)

- Embedded terminal / file tree (generic Phase 3 — separate feature work)
- Desk `mcpServers` pass-through
- Solana cluster/IDL UI panes
- Real dogfood runs on a Solana monorepo (human + diary next)

## Next human steps

1. Copy `templates/solana/AGENTS.md` into a Solana repo (or merge).
2. Run 2–3 dogfood tasks in Desk; fill diary + scorecard.
3. Prioritize terminal/file-tree if scorecard is mostly `generic-desk`.
4. Optional: live `/solana-security-pass` on a program workspace.
