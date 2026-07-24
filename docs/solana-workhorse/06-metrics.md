# Phase 6 — Success metrics and stop conditions

---

## Qualitative metrics (enough for v1)

Track after each dogfood task and weekly for two weeks of real Solana work in Desk:

| Metric | Healthy signal |
|--------|----------------|
| **Time-to-green** | Small program change reaches tests green in Desk without feeling slower than CLI TUI alone |
| **Friction mix** | Most high-severity items are `generic-desk` or `agent-*`, not `domain-ui` |
| **Skill discovery** | `/solana-dev` and security workflows found without hunting docs |
| **Secret safety** | Zero incidents of key material or RPC API keys in pins, commits, or accidental paste into shared logs |
| **Parallel value** | Multi-session (program + client + audit) used at least once productively |

---

## Quantitative (optional)

| Metric | How |
|--------|-----|
| Diary rows / week | Count friction diary entries |
| % fixed without Desk code | Rows closed by skill/workflow/AGENTS only |
| Workflow runs | Security pass / test matrix invocations that completed |
| Domain UI experiment use | Opens/week if a Phase 5 surface ships |

---

## Stop conditions

| Condition | Stop doing |
|-----------|------------|
| Dogfood shows only generic IDE gaps | Solana-named features; finish terminal/file-tree instead |
| Skills/workflows missing coverage | Building Desk panes; invest in `~/.grok` / project `.grok` assets |
| Domain UI unused after **2 weeks** | Delete or hide the experiment |
| Any secret leak via Desk UX | Treat as P0; strip logging; tighten permission defaults for deploy paths |
| Scope turns into “Solana IDE” | Return to thesis: **shell + agent stack**, not reimplementation |

---

## Go / no-go recap

| Outcome | Meaning |
|---------|---------|
| **A. Agent-first workhorse** | This pack (docs + templates + workflows) is the product |
| **B. General Desk multiplies Solana** | Prioritize P0 roadmap items in 05 |
| **C. Validated domain gap** | One thin Phase 5 experiment with kill criteria |
| **D. Not worth specializing** | Keep README pointer; do not expand this folder |

**Default after packaging:** **A + B**. C only with scorecard evidence.
