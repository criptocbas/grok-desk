# Phase 1 — Inventory: Solana on Grok Build today

**Snapshot date:** 2026-07-22  
**Machine:** developer workstation used for this packaging  
**Desk version context:** Grok Desk 0.9.x (Phase 3 workspace)

This is the “ceiling without Desk domain UI” baseline. Re-run commands below when toolchain drifts.

---

## 1.1 Toolchain matrix

| Tool | Status (snapshot) | Notes |
|------|-------------------|--------|
| `solana` CLI | **Present** — 3.1.9 (Agave) | Includes `solana-test-validator`, `cargo-build-sbf`, `cargo-test-sbf`, `spl-token` |
| `anchor` CLI | **Present** — 1.0.2 | Program scaffolding / build / test |
| `cargo` / `rustc` | **Present** — 1.94.1 | Plus Solana-related rustup toolchains (e.g. `1.89.0-sbpf-solana-*`) |
| Node | **Present** — v25.x | npm / yarn / pnpm via mise shims |
| `surfpool` | **Missing** | Integration tests against realistic cluster state; install when needed |
| LiteSVM / Mollusk | **Crates available** | Not global CLIs — depend on project `Cargo.toml` / tests |
| `grok` CLI | **Present** — 0.2.x | Agent engine for Desk ACP |

### Cluster / secrets hygiene

- Default Solana CLI config lives under `~/.config/solana/` (config.yml, keypair path).
- **Never** commit RPC URLs that embed API keys, and never paste keypair contents into chat or Desk pins.
- Prefer env vars for RPC (`ANCHOR_PROVIDER_URL`, project `.env` gitignored) over baking provider secrets into shared docs.
- Desk and agents should treat `**/id.json`, `**/*keypair*`, and `.env` as high-risk paths.

### Re-check commands

```bash
solana --version
anchor --version
rustc --version && cargo --version
node --version
command -v surfpool || echo "surfpool: not found"
solana config get   # review RPC URL — redact keys before sharing output
which grok && grok --version
```

---

## 1.2 Skill map (Solana-related)

Grok discovers skills from project/user paths including `~/.claude/skills/`, `~/.agents/skills/`, `~/.grok/skills/`, and bundled skills. Type `/` in Desk to confirm advertisements via ACP `available_commands_update`.

| Skill | Typical location | Use when |
|-------|------------------|----------|
| **solana-dev** | `~/.claude/skills/solana-dev/` | dApps, Anchor/Pinocchio, wallets, Kit, testing, deploy |
| **solana-vulnerability-scanner** | `~/.agents/skills/` (also Claude) | 6 critical Solana vuln patterns |
| **entry-point-analyzer** | `~/.agents/skills/` | Map state-changing program entry points for audits |
| **arcium-official** | `~/.claude/skills/` | Arcis patterns, ArgBuilder, live Arcium docs MCP |
| **arcium-solana-dev** | `~/.claude/skills/` | Arcium localnet/devops loop |
| **solana-stablecoin-standard** | `~/.claude/skills/` | SSS / Token-2022 stablecoin bounty work |
| **colosseum-copilot** | `~/.agents/skills/` | Solana startup / market research (not program coding) |
| **cargo-fuzz** + **coverage-analysis** | `~/.agents/skills/` | Fuzz Rust / SBF-adjacent testing |
| **insecure-defaults** | `~/.agents/skills/` | Fail-open config / secrets (clients & backends) |
| **audit-context-building** / **audit-prep-assistant** | `~/.agents/skills/` | Deep audit prep (general + contracts) |

**Slash UX:** User-invocable skills (e.g. `solana-dev` with `user-invocable: true`) should appear in Desk’s `/` palette. If a skill exists on disk but not in `/`, check `grok inspect`, `[skills] ignore/disabled` in `~/.grok/config.toml`, and that the session cwd is trusted when using project skills.

**Gap:** Solana skills live mostly under Claude/agents compatibility paths, not under `~/.grok/skills/`. That is fine while Claude compat skills are enabled (default).

---

## 1.3 MCP reality

| Fact | Implication |
|------|-------------|
| Desk `session/new` and `session/load` pass **`mcpServers: []`** | Desk does **not** inject MCP servers per session today |
| Grok still loads MCP from **`~/.grok/config.toml`** and project **`.grok/config.toml`** (when folder trusted) | Solana-related MCP is an **agent/config** concern, not a Desk feature |
| Typical connected MCP on this machine (non-Solana): GitHub, Playwright, Notion, etc. | Useful for ship loop / docs; not cluster RPC |
| Arcium official skill ships **mcp.json** for docs search | Domain MCP can ride skills/plugins |

**Conclusion:** Do **not** block Solana work on Desk MCP pass-through. Optional later: generic Desk UI to show connected MCP names (already agent-side). See [04-mcp-shortlist.md](./04-mcp-shortlist.md).

---

## 1.4 Project conventions (for agent success)

Ideal Solana monorepo signals for Grok:

```
repo/
  AGENTS.md                 # build/test/deploy, cluster rules, secrets
  Anchor.toml               # or Cargo workspace for native/Pinocchio
  programs/                 # on-chain
  tests/ or programs/*/tests
  app/ or clients/          # frontend / TS SDK
  target/deploy/*.so        # build artifacts (gitignored)
  target/idl/*.json         # IDL artifacts
  .grok/workflows/          # shareable Rhai workflows
  .gitignore                # keypairs, .env, target/
```

**Commands agents should find in `AGENTS.md`:**

- Build: `anchor build` or `cargo build-sbf`
- Test: `anchor test`, `cargo test`, LiteSVM/Mollusk targets
- Localnet: how to start/stop `solana-test-validator` (or Surfpool)
- Deploy: devnet only by default; mainnet requires explicit human approval
- Client generate: Codama / Anchor TS client steps if used

---

## 1.5 Ceiling without Desk changes

Works **today** in Desk + Grok:

- Multi-session program | frontend | audit
- Plan mode + Diff + line comments on program changes
- Long Heavy runs (6h prompt wait) for builds/audits
- Activity feed for tools/subagents/workflows
- Slash skills for Solana playbooks
- Agent shell for `anchor test`, validator, deploy scripts

Does **not** require Solana panes:

- Cluster badge, IDL browser, CU flame chart — only if dogfood proves need

---

## Gaps to watch

| Gap | Severity | Fix layer |
|-----|----------|-----------|
| No embedded terminal in Desk yet | High for validator logs | Generic Desk (roadmap) |
| No file tree in Desk yet | Medium | Generic Desk (roadmap) |
| Surfpool not installed | Medium for integration tests | Local toolchain |
| Desk `mcpServers: []` | Low for Solana if user MCP works | Agent config; optional Desk later |
| No shareable Solana `AGENTS.md` by default | Medium | **Templates in this pack** |
| No default security/test workflows | Medium | **Workflows in this pack** |
