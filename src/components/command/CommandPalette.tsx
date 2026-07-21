import { useEffect, useMemo, useRef, useState } from "react";

export type PaletteCommand = {
  id: string;
  label: string;
  /** Optional secondary line (cwd, shortcut hint, …) */
  detail?: string;
  /** Keys chip, e.g. "Alt+P" */
  shortcut?: string;
  group: string;
  /** Hide from list when false */
  enabled?: boolean;
  run: () => void;
};

type Props = {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
};

function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  const enabled = commands.filter((c) => c.enabled !== false);
  if (!q) return enabled;
  return enabled
    .map((c) => {
      const label = c.label.toLowerCase();
      const detail = (c.detail || "").toLowerCase();
      const group = c.group.toLowerCase();
      let score = -1;
      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 80;
      else if (label.includes(q)) score = 50;
      else if (detail.includes(q)) score = 30;
      else if (group.includes(q)) score = 15;
      return { c, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.c.label.localeCompare(b.c.label))
    .map((x) => x.c);
}

/**
 * Linux-first command launcher — denser than macOS Spotlight.
 * Visual language: IDE / KRunner / forge mission-control (not Apple chrome).
 */
export function CommandPalette({ open, commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${index}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [index, open, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[index];
        if (cmd) {
          onClose();
          requestAnimationFrame(() => cmd.run());
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, filtered, index, onClose]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[color-mix(in_srgb,var(--bg)_55%,transparent)] p-3 pt-[10vh]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
        className="fade-up flex w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-[var(--shadow-panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search row — no ⌘; Linux uses Ctrl */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <span
            className="mono shrink-0 text-[11px] font-medium text-[var(--accent)]"
            aria-hidden
          >
            &gt;
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter commands…"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="kbd">Esc</span>
        </div>

        <ul
          ref={listRef}
          className="max-h-[min(24rem,52vh)] overflow-y-auto py-0.5"
          role="listbox"
          aria-label="Commands"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-5 text-center text-[12px] text-[var(--text-muted)]">
              No matches
            </li>
          ) : (
            filtered.map((cmd, i) => {
              const showGroup = cmd.group !== lastGroup;
              lastGroup = cmd.group;
              const selected = i === index;
              return (
                <li key={cmd.id}>
                  {showGroup && (
                    <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                      {cmd.group}
                    </div>
                  )}
                  <button
                    type="button"
                    data-idx={i}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => {
                      onClose();
                      requestAnimationFrame(() => cmd.run());
                    }}
                    className={`flex w-full items-center gap-2 border-l-2 px-3 py-1.5 text-left text-[12px] ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--bg-active)] text-[var(--text)]"
                        : "border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate ${selected ? "font-medium text-[var(--text)]" : "text-[var(--text)]"}`}
                      >
                        {cmd.label}
                      </div>
                      {cmd.detail && (
                        <div className="mono truncate text-[10px] text-[var(--text-faint)]">
                          {cmd.detail}
                        </div>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <span className="mono shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                        {cmd.shortcut}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] text-[var(--text-faint)]">
          <span className="flex items-center gap-1">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            <span>move</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">Enter</span>
            <span>run</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">Esc</span>
            <span>close</span>
          </span>
          <span className="mono ml-auto text-[var(--text-muted)]">Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
