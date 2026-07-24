# Phase 3.4 — MCP shortlist (optional)

MCP is configured in **Grok** (`~/.grok/config.toml` or project `.grok/config.toml` with folder trust), **not** via Desk’s empty `mcpServers: []` session field.

Use MCP only when skills + CLI are not enough. Prefer **read-only** tools. **Never** put private keys in MCP env that gets committed.

---

## Recommended categories

| Priority | Category | Purpose | Key rule |
|----------|----------|---------|----------|
| P0 | None required | Solana CLI + skills cover local build/test | — |
| P1 | Docs search (stack-specific) | e.g. Arcium docs MCP from `arcium-official` | No signing |
| P2 | GitHub MCP | PRs/CI for program repos | Already common |
| P2 | Playwright MCP | dApp UI smoke | No wallet seed automation |
| P3 | RPC / account fetch MCP | Inspect accounts without hand-rolling curl | **Read-only**; API key via `${ENV}` not git |
| Avoid | Anything that signs transactions or holds keys | Custody risk | Out of scope |

---

## Configuration pattern (safe)

```toml
# ~/.grok/config.toml  (user scope) OR project .grok/config.toml
# Example shape only — verify package names before installing.

# [mcp_servers.some-readonly-rpc]
# command = "npx"
# args = ["-y", "some-solana-mcp-package"]
# env = { RPC_URL = "${SOLANA_RPC_URL}" }   # expand from environment; do not paste keys
# enabled = true
```

CLI:

```bash
grok mcp list
grok mcp doctor
# grok mcp add ...   # see: grok docs user-guide 07-mcp-servers
```

Project-scoped MCP requires folder trust (`/hooks-trust` or equivalent) so untrusted repos cannot run arbitrary servers.

---

## Desk implication

| Idea | Do now? |
|------|---------|
| Pass `mcpServers` from Desk UI into `session/new` | **No** — not required for Solana v1; generic feature if ever built |
| Show “MCP connected” status in Desk | Nice-to-have general UX; not Solana-specific |
| Solana RPC pane inside Tauri | **No** — use CLI or MCP via agent |

---

## When to add RPC MCP

Add only if dogfood scorecard tags multiple items `mcp` with high severity, e.g.:

- Repeated “fetch account X and decode” across sessions
- Explorer context switching costing more time than CLI

Otherwise stick to:

```bash
solana account <ADDR>
solana program show <PROGRAM>
anchor test
```
