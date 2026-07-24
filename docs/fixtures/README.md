# Fixtures for Desk parsers / smoke mental models

Anonymized shapes matching real Grok ACP / disk payloads. Used while implementing:

- `activity.ts` parse/upsert/hydrate helpers  
- Transcript grouping (`groupTranscriptItems`)  
- Tier 2b disk hydrate (`meta.json` under `~/.grok/sessions/.../subagents/`)

| File | Purpose |
|------|---------|
| `subagent_spawned.json` | ACP `session/update` kind `subagent_spawned` |
| `subagent_finished.json` | ACP `session/update` kind `subagent_finished` |
| `subagent_meta.json` | On-disk `meta.json` under `subagents/<id>/` |
| `transcript_tool_group.json` | Chat items that should collapse into one tool group |

These are **not** loaded by the app at runtime.
