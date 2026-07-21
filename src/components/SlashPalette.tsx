import { useEffect, useMemo, useRef } from "react";
import type { AvailableCommand } from "../types";

export type SlashMatch = {
  start: number;
  end: number;
  /** Text after `/` while typing the command token. */
  query: string;
};

type Props = {
  open: boolean;
  commands: AvailableCommand[];
  match: SlashMatch | null;
  selectedIndex: number;
  onSelectedIndex: (i: number) => void;
  onPick: (cmd: AvailableCommand) => void;
  onClose: () => void;
};

/** Fuzzy-ish filter: substring on name/description, name-prefix preferred. */
export function filterCommands(
  commands: AvailableCommand[],
  query: string,
): AvailableCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands.slice(0, 80);
  const scored = commands
    .map((c) => {
      const name = c.name.toLowerCase();
      const desc = (c.description || "").toLowerCase();
      let score = -1;
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80 - Math.min(name.length, 40);
      else if (name.includes(q)) score = 40;
      else if (desc.includes(q)) score = 20;
      // plugin-qualified: "vercel:auth" match "auth"
      else if (name.includes(":") && name.split(":").pop()?.startsWith(q))
        score = 70;
      return { c, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
  return scored.slice(0, 50).map((x) => x.c);
}

/**
 * If the cursor sits in a `/token` (start of line or after whitespace),
 * return the token range for palette completion.
 */
export function getSlashMatch(
  text: string,
  cursor: number,
): SlashMatch | null {
  if (cursor < 0 || cursor > text.length) return null;
  const before = text.slice(0, cursor);
  // Only complete the command name token (no spaces after /name yet unless still on it)
  const m = before.match(/(?:^|[\s])(\/[^\s]*)$/);
  if (!m) return null;
  const token = m[1];
  const start = before.length - token.length;
  // If there's already a space after the command in the full text, still only
  // match while cursor is inside the token.
  const end = start + token.length;
  if (cursor < start || cursor > end) return null;
  return {
    start,
    end,
    query: token.slice(1),
  };
}

export function SlashPalette({
  open,
  commands,
  match,
  selectedIndex,
  onSelectedIndex,
  onPick,
  onClose,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const filtered = useMemo(
    () => (match ? filterCommands(commands, match.query) : []),
    [commands, match],
  );

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open, filtered.length]);

  if (!open || !match) return null;

  if (commands.length === 0) {
    return (
      <div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-muted)] shadow-[var(--shadow-panel)]">
        Slash commands appear after the agent advertises them (usually right
        after the session starts). Keep typing or send{" "}
        <span className="mono">/help</span> once connected.
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-muted)] shadow-[var(--shadow-panel)]">
        No commands match{" "}
        <span className="mono text-[var(--text)]">/{match.query}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 text-[var(--text-faint)] hover:text-[var(--text)]"
        >
          Esc
        </button>
      </div>
    );
  }

  return (
    <div
      className="mb-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-[var(--shadow-panel)]"
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
          Commands & skills
        </span>
        <span className="text-[10px] text-[var(--text-faint)]">
          <span className="kbd">↑↓</span>{" "}
          <span className="kbd">Tab</span>/<span className="kbd">Enter</span>{" "}
          insert · <span className="kbd">Esc</span>
        </span>
      </div>
      <ul ref={listRef} className="max-h-56 overflow-y-auto py-1">
        {filtered.map((cmd, i) => {
          const active = i === selectedIndex;
          return (
            <li key={`${cmd.name}-${i}`}>
              <button
                type="button"
                data-idx={i}
                role="option"
                aria-selected={active}
                onMouseEnter={() => onSelectedIndex(i)}
                onClick={() => onPick(cmd)}
                className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-[12px] ${
                  active
                    ? "bg-[var(--bg-active)] text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                <span className="mono shrink-0 font-medium text-[var(--accent)]">
                  /{cmd.name}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {cmd.description ||
                    (cmd.inputHint ? `args: ${cmd.inputHint}` : "")}
                </span>
                {cmd.inputHint && (
                  <span className="mono hidden shrink-0 text-[10px] text-[var(--text-faint)] sm:inline">
                    {cmd.inputHint}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-[var(--border)] px-3 py-1 text-[10px] text-[var(--text-faint)]">
        {filtered.length} match{filtered.length === 1 ? "" : "es"}
        {commands.length > filtered.length
          ? ` · ${commands.length} total`
          : ""}
      </div>
    </div>
  );
}
