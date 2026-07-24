# Phase 2 — Dogfood experiment

**Goal:** Separate “needs better Desk” from “needs better skills/prompts/workflows” with evidence.

**Rule:** Use **Desk only** (no new Solana UI). Log friction. Score each item.

Templates (copy into a private notes folder or a scratch branch — do not commit secrets):

- [`templates/solana/dogfood-friction-diary.md`](../../templates/solana/dogfood-friction-diary.md)
- [`templates/solana/dogfood-scorecard.md`](../../templates/solana/dogfood-scorecard.md)

---

## Suggested real tasks

Pick **2–3** from your tree under `~/Documents/Programming/solana/` (or any program repo).

| # | Task type | Example prompt in Desk | Skills to lean on |
|---|-----------|------------------------|-------------------|
| 1 | **Program + tests** | “Add a constrained instruction + LiteSVM/Anchor tests; keep CU reasonable.” | `solana-dev` |
| 2 | **Client / wallet / tx** | “Wire this instruction into the client; confirm cluster + error UX.” | `solana-dev` |
| 3 | **Security pass** | “Run a security pass on programs/*; adversarial-verify findings.” | `/solana-security-pass`, `solana-vulnerability-scanner`, `entry-point-analyzer` |
| Optional | **IDL sync** | “Check IDL and client types are in sync after program changes.” | `/idl-client-sync` |
| Optional | **Arcium / specialized** | Only if that stack is in the repo | `arcium-official`, `arcium-solana-dev` |

### Session layout (recommended)

| Tab | cwd focus | Permission mode |
|-----|-----------|-----------------|
| Program | monorepo root or `programs/` | always-approve on **localnet** work only |
| Client | `app/` or `clients/` | ask if touching env / deploy |
| Audit | monorepo root | read-heavy; always-approve OK for read/grep |

---

## How to run one task

1. Connect Desk → open the project folder → New session (name it).
2. Paste/adapt project `AGENTS.md` if missing (from template).
3. Enter Plan mode for multi-file designs; Approve when solid.
4. Implement; watch Diff auto-refresh; leave line comments on risky `+` lines.
5. Run tests via agent (`anchor test` / project script). Note whether you wished for a **terminal pane**.
6. For security: run `/solana-security-pass` (or manual skill sequence).
7. Fill **one row per friction** in the diary; tag layer on the scorecard.

---

## Decision gate (after ≥2 tasks)

Count high-severity items by tag:

| Dominant tag | Next move |
|--------------|-----------|
| `agent-skill` / `agent-workflow` | Improve skills, AGENTS.md, workflows — **not** Desk UI |
| `generic-desk` | Prioritize terminal / file tree (see [05-desk-upgrades.md](./05-desk-upgrades.md)) |
| `mcp` | Add read-only MCP from [04-mcp-shortlist.md](./04-mcp-shortlist.md) |
| `domain-ui` (≥2 high-severity) | Only then design **one** thin surface experiment |
| `out-of-scope` | Document and ignore |

**Default expectation:** most pain lands in `generic-desk` + `agent-*`, not `domain-ui`.
