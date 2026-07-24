# AGENTS.md — Solana project

Instructions for coding agents (Grok Build / Grok Desk) working in this repository.

## Stack

- **Programs:** Anchor (default) / Pinocchio if this repo says so
- **Clients:** Prefer `@solana/kit` + framework-kit (`@solana/client`, `@solana/react-hooks`) where applicable
- **Tests:** Prefer LiteSVM or Mollusk for unit speed; `anchor test` / Surfpool for integration when configured
- **Clusters:** localnet for iteration; devnet when asked; **mainnet only with explicit human approval**

## Commands (edit to match this repo)

```bash
# Build
anchor build
# cargo build-sbf

# Test
anchor test
# cargo test
# cargo test-sbf

# Local validator (if used)
# solana-test-validator
# solana config set --url localhost

# IDL / client (if used)
# anchor build   # refreshes target/idl
# <your codegen command>
```

## Non-negotiable safety

1. **Never commit** keypairs, seed phrases, `.env` with secrets, or RPC URLs that embed API keys.
2. **Never** print or log private key material into chat, commits, or CI logs.
3. Treat `~/.config/solana/id.json` and any `*-keypair.json` as **read-sensitive** — do not copy contents into the repo.
4. Default deploy target is **localnet or devnet**. Mainnet deploy/upgrade requires an explicit user instruction in the current turn.
5. Prefer program-derived addresses and explicit account validation; no unchecked `AccountInfo` trust.
6. Token work: be explicit about SPL Token vs Token-2022 and any extensions.

## How to work

1. Read this file and the nearest program `Cargo.toml` / `Anchor.toml` before editing.
2. Classify work: program | client/SDK | tests | infra (RPC/deploy).
3. For multi-step design, use **plan mode** and wait for approval.
4. After program interface changes, sync IDL and regenerate clients if this repo uses codegen.
5. Add or update tests with every instruction or account-validation change.
6. For security reviews, map entry points first, then scan CPI/signer/owner/PDA/sysvar patterns.

## Suggested agent skills / workflows

- `solana-dev` — implementation playbook
- `solana-vulnerability-scanner` — critical Solana patterns
- `entry-point-analyzer` — attack-surface map
- Workflows (if present under `.grok/workflows/`):
  - `solana-security-pass`
  - `solana-test-matrix`
  - `idl-client-sync`

## Review checklist (before claiming done)

- [ ] Build succeeds
- [ ] Tests covering new paths pass
- [ ] Account constraints / signers / owners documented in code or comments where non-obvious
- [ ] No secrets staged
- [ ] Cluster used for any deploy/test is stated in the summary
