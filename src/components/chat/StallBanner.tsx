type Props = {
  stallSeconds: number;
  onStop: () => void;
  onUnlock: () => void;
  onRefreshDiffs: () => void;
};

export function StallBanner({
  stallSeconds,
  onStop,
  onUnlock,
  onRefreshDiffs,
}: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-[var(--warning)]/40 bg-[#2a1f08] px-4 py-2 text-xs"
      role="status"
      aria-live="polite"
    >
      <span className="text-[var(--warning)]">
        No agent traffic for {stallSeconds}s — may still be thinking, or stuck
        mid-tool.
      </span>
      <button
        type="button"
        onClick={onStop}
        className="rounded border border-[var(--warning)]/50 px-2 py-0.5 text-[var(--warning)] hover:bg-[var(--warning)]/10"
      >
        Stop
      </button>
      <button
        type="button"
        onClick={onUnlock}
        className="rounded border border-[var(--border)] px-2 py-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        Unlock UI
      </button>
      <button
        type="button"
        onClick={onRefreshDiffs}
        className="rounded border border-[var(--border)] px-2 py-0.5 text-[var(--tool)] hover:bg-[var(--tool)]/10"
      >
        Refresh diffs
      </button>
    </div>
  );
}
