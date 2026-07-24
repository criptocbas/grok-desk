# Phase 4 — Generic Desk upgrades that multiply Solana

These are **roadmap features**, not Solana-branded panes. Ranking below is the **pre-dogfood default**; re-rank after filling [02-dogfood.md](./02-dogfood.md) scorecards.

---

## Priority table (Solana-weighted)

| Pri | Roadmap item | Why Solana cares | Desk phase |
|-----|--------------|------------------|------------|
| **P0** | Embedded terminal (PTY in project cwd) | Validator logs, `anchor test`, interactive deploy, Surfpool | Phase 3 |
| **P0** | File tree + open external editor | `programs/`, IDL, `target/deploy`, tests layout | Phase 3 |
| **P1** | Workspace chrome / Ctrl+K command palette | Jump sessions; run common actions | Phase 3 |
| **P1** | Subagent Tier 2b (disk hydrate + full child transcript) | Audit fan-out readability | Phase 3 |
| **P2** | Ship loop (`gh`, CI poll) | Program PRs + `cargo-test-sbf` CI | Phase 4 |
| **P2** | Preview / dev-server pane | dApp frontend verify | Phase 6 |
| **P3** | Worktree-per-session | Parallel program experiments | Later |

---

## Explicitly **not** prioritized (until dogfood forces it)

| Domain UI idea | Why wait |
|----------------|----------|
| Cluster / localnet status chip | Process manager creep; CLI/`solana cluster-version` enough initially |
| IDL JSON viewer pane | Chat + file open + Diff cover most cases |
| CU / sim flame graph | Brittle parsers; agent can summarize test logs |
| In-app wallet | Custody / security nightmare — **never** |

If implementing any domain surface later: prefer **agent writes a small machine-readable summary file** that Desk renders over Desk shelling out to Solana itself.

---

## Implementation discipline

1. Ship generic features under normal Phase 3/4 PRs.
2. Do not rename them “Solana mode.”
3. Keep `clientCapabilities.fs/terminal` **false**.
4. Measure with [06-metrics.md](./06-metrics.md) after terminal/file-tree land.

---

## Mapping dogfood tags → action

| Scorecard tag | Action |
|---------------|--------|
| `generic-desk` | Bump corresponding row above; implement when Phase 3 capacity allows |
| `agent-skill` / `agent-workflow` | Edit skills/workflows/templates only |
| `domain-ui` | Write a one-pager experiment design; single surface max; kill criteria in metrics |
