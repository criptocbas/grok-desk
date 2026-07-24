# Solana workhorse — Grok Desk + Grok Build

**Thesis:** Desk does not need to become a Solana IDE. A strong general shell (sessions, plan, diff, activity, terminal) plus agent skills, project `AGENTS.md`, and workflows already makes Solana development excellent.

This folder is the **agent-first packaging** from the Solana workhorse plan: inventory, dogfood kits, profiles, workflows, and upgrade ranking. **No Solana-specific Desk UI** is required for v1.

| Doc | What |
|-----|------|
| [01-inventory.md](./01-inventory.md) | Toolchain, skills, MCP reality (snapshot) |
| [02-dogfood.md](./02-dogfood.md) | Experiment tasks + how to score friction |
| [03-profile.md](./03-profile.md) | Workspace profile & Desk habits |
| [04-mcp-shortlist.md](./04-mcp-shortlist.md) | Optional MCP (read-only, no keys) |
| [05-desk-upgrades.md](./05-desk-upgrades.md) | Generic Desk features that multiply Solana |
| [06-metrics.md](./06-metrics.md) | Success metrics & stop conditions |

| Template | Path |
|----------|------|
| Project agent instructions | [`templates/solana/AGENTS.md`](../../templates/solana/AGENTS.md) |
| Grok config snippet | [`templates/solana/solana-profile.toml.example`](../../templates/solana/solana-profile.toml.example) |
| Friction diary | [`templates/solana/dogfood-friction-diary.md`](../../templates/solana/dogfood-friction-diary.md) |
| Scorecard | [`templates/solana/dogfood-scorecard.md`](../../templates/solana/dogfood-scorecard.md) |

| Workflow | Path | Invoke |
|----------|------|--------|
| Security pass | [`.grok/workflows/solana-security-pass.rhai`](../../.grok/workflows/solana-security-pass.rhai) | `/solana-security-pass` or `/workflow solana-security-pass` |
| Test matrix | [`.grok/workflows/solana-test-matrix.rhai`](../../.grok/workflows/solana-test-matrix.rhai) | `/solana-test-matrix` |
| IDL ↔ client sync check | [`.grok/workflows/idl-client-sync.rhai`](../../.grok/workflows/idl-client-sync.rhai) | `/idl-client-sync` |

## Quick start (any Solana repo)

1. Open the repo as the Desk session **cwd** (Connect → pick folder → New session).
2. Copy [`templates/solana/AGENTS.md`](../../templates/solana/AGENTS.md) into the repo root (or merge into an existing one).
3. Optional: copy workflows into that repo’s `.grok/workflows/` so teammates get them.
4. In Desk, type `/` and confirm `solana-dev` (and security skills) appear.
5. Prefer **multi-session**: program | client | audit.
6. Use **Plan mode** for multi-step designs; **Diff** for program + IDL review; **Activity** for long builds and subagent audits.
7. Permission mode: **always-approve** only for localnet iteration; switch to **ask** before mainnet deploy / key material paths.

## Architecture rules (do not regress)

1. **Agent owns Solana CLI and file edits** — Desk presents plan/diff/activity (and later terminal).
2. Client ACP `fs` / `terminal` stay **false** (agent-local tools).
3. **Never** put keypairs, RPC API keys, or seed phrases into pins, notifications, transcripts by design, or committed configs.
4. Domain UI (validator chip, IDL drawer) only after dogfood proves a chat-only gap — see [05-desk-upgrades.md](./05-desk-upgrades.md) and [06-metrics.md](./06-metrics.md).

## Non-goals

- Reimplementing Anchor/Solana inside Tauri
- Wallet custody or signing in Desk
- Competing with explorers or VS Code + Anchor
- GrokLink / phone remote
