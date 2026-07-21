type Props = {
  subagentCount: number;
  backgroundCount: number;
  onOpenActivity: () => void;
};

/**
 * Shown when parent may look idle but child subagents / bg tasks still run.
 * Click opens the Activity rail (TUI "watching" parity).
 */
export function WatchingBanner({
  subagentCount,
  backgroundCount,
  onOpenActivity,
}: Props) {
  if (subagentCount <= 0 && backgroundCount <= 0) return null;

  const parts: string[] = [];
  if (subagentCount > 0) {
    parts.push(
      `${subagentCount} subagent${subagentCount === 1 ? "" : "s"}`,
    );
  }
  if (backgroundCount > 0) {
    parts.push(
      `${backgroundCount} bg task${backgroundCount === 1 ? "" : "s"}`,
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenActivity}
      className="flex w-full items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-1.5 text-left text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
      aria-live="polite"
      title="Open Activity (Alt+A)"
    >
      <span
        className="status-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--thought)]"
        aria-hidden
      />
      <span>
        <span className="font-medium text-[var(--thought)]">watching</span>
        {" · "}
        {parts.join(" · ")}
      </span>
      <span className="mono ml-auto text-[10px] text-[var(--text-faint)]">
        Alt+A
      </span>
    </button>
  );
}
