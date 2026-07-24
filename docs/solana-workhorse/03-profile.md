# Phase 3 — Solana workspace profile

Packaging for humans and agents — **not** a Desk product fork.

---

## 3.1 Recommended skills (enabled)

Ensure these resolve in `grok inspect` / Desk `/` when doing Solana work:

**Core**

- `solana-dev`
- `solana-vulnerability-scanner`
- `entry-point-analyzer`

**As needed**

- `arcium-official` + `arcium-solana-dev` (encrypted compute)
- `solana-stablecoin-standard` (SSS / Token-2022)
- `cargo-fuzz`, `coverage-analysis`
- `insecure-defaults` (clients/backends)
- `colosseum-copilot` (research only)

Claude-compat skill dirs are scanned by default; keep that unless you intentionally disable `[compat.claude]`.

---

## 3.2 Desk habits (permission + model)

| Context | Permission mode | Effort / model notes |
|---------|-----------------|----------------------|
| Localnet implement/test loop | **Always-approve** | Normal/high effort for program design |
| Reading / audit | Always-approve or Ask | High effort; prefer plan mode first |
| Devnet deploy | **Ask** | Confirm cluster + program id |
| Mainnet or keypaths | **Ask** + human gate | Never auto-approve deploy/key ops |
| Parallel tracks | Multi-session tabs | Program / client / audit |

Model: use whatever SuperGrok / grok-build session model Desk exposes; prefer higher reasoning effort for security and account-validation design.

---

## 3.3 Cluster env conventions

Document in each repo’s `AGENTS.md` (see template):

```bash
# Examples only — do not commit real keys
export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899          # localnet
# export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com # devnet public
# Prefer project .env (gitignored) for private RPC
```

| Cluster | Agent default |
|---------|----------------|
| localnet | OK to iterate freely |
| devnet | OK with explicit mention; watch airdrop / rate limits |
| mainnet-beta | **No deploy/transfer** unless user explicitly orders it |

---

## 3.4 Project files to copy

From this repo:

```bash
# From grok-desk checkout
REPO=/path/to/your-solana-project

cp templates/solana/AGENTS.md "$REPO/AGENTS.md"   # or merge
mkdir -p "$REPO/.grok/workflows"
cp .grok/workflows/solana-security-pass.rhai \
   .grok/workflows/solana-test-matrix.rhai \
   .grok/workflows/idl-client-sync.rhai \
   "$REPO/.grok/workflows/"
```

Optional user-global workflows (all projects):

```bash
mkdir -p ~/.grok/workflows
cp .grok/workflows/solana-*.rhai .grok/workflows/idl-client-sync.rhai ~/.grok/workflows/
```

Optional Grok config snippets: [`templates/solana/solana-profile.toml.example`](../../templates/solana/solana-profile.toml.example) — merge carefully into `~/.grok/config.toml`; never commit secrets.

---

## 3.5 Slash UX checklist

In a Desk session on a Solana repo:

1. Type `/` → search `solana` — expect `solana-dev` and security-related skills.
2. Type `/workflow` or search workflow names after copying Rhai files.
3. If missing: run `grok inspect` in that cwd; check folder trust for project MCP/hooks; confirm skill files are not under `[skills] ignore`.

---

## 3.6 What “excelling” means without domain UI

| Loop | Desk feature | Agent asset |
|------|--------------|-------------|
| Design | Plan pane + approval | `solana-dev` procedures |
| Implement | Diff + multi-session | Anchor/Pinocchio conventions in AGENTS.md |
| Test | Activity + (future terminal) | `/solana-test-matrix` |
| Secure | Subagents + Activity | `/solana-security-pass` |
| Ship | Phase 4 roadmap (`gh`/CI) | project CI + PR skill |
