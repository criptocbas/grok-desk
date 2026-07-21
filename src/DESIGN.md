# Grok Desk — Design System

Mission-control UI for Grok Build. **Dense, reliable, keyboard-first** — not a marketing chat client.

Inspired by Linear / Raycast / Cursor surfaces, with a forge identity (not generic cyan AI chrome).

## Principles

1. **Structure over decoration** — elevation via surface ladder + hairline borders, not heavy shadows.
2. **Honest states** — busy, stalled, permission-needed, and plan-approval must never look idle.
3. **Progressive disclosure** — agent complexity (tools, plans, raw JSON) opens on demand.
4. **Protect reliability chrome** — stall banner, Stop/Unlock, caps, plan handshake stay first-class.
5. **Keyboard first** — every primary action has a shortcut; focus rings always visible on keyboard.

## Canvas & surfaces (dark-first)

Never pure `#000` or `#fff` (eye strain / halo on OLED).

| Token | Role | Default (dark) |
|-------|------|----------------|
| `--bg` | App canvas | `#0a0a0b` |
| `--bg-elevated` | Titlebar, session chrome | `#111113` |
| `--bg-panel` | Sidebar, utility panels | `#141416` |
| `--bg-hover` | Row/button hover | white ~5% |
| `--bg-active` | Selected row / active control | accent ~12% |

**Borders:** `--border` ≈ white 6–8%; `--border-strong` ≈ white 12%. Prefer hairlines over fills.

**Shadows:** Minimal. Panel float only (`--shadow-panel`). Prefer border elevation.

## Accent & semantics

| Token | Use |
|-------|-----|
| `--accent` | Primary actions, selection, brand (forge copper default) |
| `--accent-fg` | Text on solid accent buttons |
| `--success` / `--success-fg` | Ready, completed, approve (fg = text on solid success) |
| `--warning` / `--warning-fg` | Busy, stall, always-approve, plan waiting |
| `--danger` / `--danger-fg` | Deny, errors, failed tools |
| `--bg-warning-subtle` / `--bg-danger-subtle` | Banner / alert surfaces (stall, permission, errors) |
| `--tool` | Tool/diff/activity (teal) |
| `--thought` | Plan mode / thinking (violet) |

**Single primary.** Do not invent a second brand color for buttons. Tool/thought are semantic, not brand.

Optional presets (Settings later): Forge (default) · Indigo · Teal — swap `--accent` / `--accent-fg` only.

## Typography

- **UI:** Inter (preferred) with system-ui fallback; IBM Plex Sans acceptable.
- **Mono:** IBM Plex Mono / JetBrains Mono / ui-monospace — paths, IDs, diffs, kbd.
- Scale (comfortable): 10 / 11 / 12 / 13 / 14 / display 18–20.
- Display titles: slight negative tracking (`tracking-tight`).
- Section labels: 10px uppercase, wide tracking, `--text-faint`.

## Spacing & radius

- Grid: **4 / 8px**.
- Radii: `--radius-sm: 6px`, `--radius: 8px`, `--radius-lg: 12px` (dense mission control; avoid 16px+ blobs).
- Row heights: comfortable ~36–40px; compact ~28–32px (`data-density`).

## Density

```html
<html data-density="comfortable"> <!-- or compact -->
```

| Var | comfortable | compact |
|-----|-------------|---------|
| `--font-ui` | 13px | 12px |
| `--space-1` | 4px | 3px |
| `--space-2` | 8px | 6px |
| `--row-h` | 36px | 28px |

## Interactive states

| State | Treatment |
|-------|-----------|
| Hover | `--bg-hover` or border → `--border-strong` |
| Active / selected | `--bg-active` + accent ring or left bar |
| Focus-visible | 2px accent outline, 2px offset (never remove) |
| Disabled | opacity 0.4; no pointer events styling that looks clickable |
| Danger hover | border/text → `--danger` |

## Motion

- Rail / panel enter: 140–180ms ease-out.
- Respect `prefers-reduced-motion: reduce` — no transform animations.
- Streaming / busy: pulse only on status dots (not whole panels).

## Layout contracts

```
Titlebar
Left Navigator | Center Workbench | Right Utility (Plan · Diff · Activity · Settings)
```

- Left collapse: icon rail (Ctrl+B / Alt+B).
- Right collapse: icon strip; badges for plan/diff/activity.
- Utility width: resizable, persisted.
- Chat-first: right rail closed by default until plan/diff needs attention.

## Components (usage)

| Surface | Notes |
|---------|-------|
| Session rows | Status dot left; title; mono meta; pin/close on hover |
| Stall banner | Warning surface; Stop · Unlock · Refresh always visible |
| Permission cards | Structured summary first; raw JSON progressive |
| Plan approval | Sticky warning header; Approve / Revise / Abandon |
| Diff | Status-colored files; click `+` lines for review notes |
| Composer | Queue when busy (honest label); `/` skills; image chips |
| Empty states | Teach shortcuts; never modal traps for power users |

## Accessibility

- WCAG **AA** minimum for body text on all surfaces.
- ARIA live regions for busy, permission, plan approval, stall.
- Keyboard: full nav without mouse; Escape closes layers (palette → rail → help).
- Do not rely on color alone for status (pair with label or icon).

## What not to do

- Pure black/white canvases.
- **Hardcoded `text-white` / `text-black` on content** — use `text-[var(--text)]` so light theme stays readable (RichText was the classic trap).
- Rainbow gradients, glassmorphism stacks, or “AI purple glow” as chrome.
- Reimplement agent logic in the UI.
- Unbounded thought/transcript storage.
- Hide stall/cancel behind menus.
- Modal onboarding that blocks Connect.

## File ownership

| Path | Owns |
|------|------|
| `src/index.css` | Tokens + base |
| `src/components/layout/*` | Shell surfaces |
| `src/components/chat/*` | Transcript, composer, banners |
| `src/App.tsx` | Composition + ACP session wiring only |
| `src-tauri/src/acp.rs` | Protocol — not styling |
