type Props = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUTS: [string, string][] = [
  ["Alt + P", "Toggle Plan panel"],
  ["Alt + D", "Toggle Diff panel"],
  ["Alt + A", "Toggle Activity panel"],
  ["Esc", "Close panel / slash palette / help"],
  ["/", "Slash commands & skills palette"],
  ["↑ ↓ Tab", "Navigate / complete slash command"],
  ["Enter", "Send, queue if busy, or complete slash"],
  ["Shift + Enter", "New line in composer"],
  ["Scroll up", "Pause auto-follow; Jump to latest to resume"],
  ["📌 Pin", "Keep session across Desk restarts · drag to reorder"],
  ["Ctrl+B / Alt+B", "Collapse / expand left sidebar"],
  ["Ctrl + /", "This help"],
];

export function ShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6 backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="fade-up w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Close
          </button>
        </div>
        <ul className="space-y-2 text-[13px]">
          {SHORTCUTS.map(([keys, desc]) => (
            <li
              key={keys}
              className="flex items-center justify-between gap-4 border-b border-[var(--border)]/60 py-2 last:border-0"
            >
              <span className="text-[var(--text-muted)]">{desc}</span>
              <span className="mono shrink-0 text-[11px] text-[var(--accent)]">
                {keys}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
