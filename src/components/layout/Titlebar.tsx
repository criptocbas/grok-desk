import type { AppVersionInfo } from "../../types";

type Props = {
  running: boolean;
  headerStatus: string;
  activeBusy?: boolean;
  activePermissionCount?: number;
  /** Short tier label only (e.g. SuperGrok Heavy) — optional, compact. */
  tierLabel?: string | null;
  appVersion?: AppVersionInfo | null;
  updateAvailable?: boolean;
  onShowShortcuts: () => void;
  onOpenUpdates?: () => void;
};

/**
 * App chrome only: connection + updates + help.
 * Session detail, email, CLI version live in Settings → About.
 */
export function Titlebar({
  running,
  headerStatus,
  activeBusy,
  activePermissionCount,
  tierLabel,
  appVersion,
  updateAvailable,
  onShowShortcuts,
  onOpenUpdates,
}: Props) {
  const ver = appVersion?.version ?? "0.9";
  return (
    <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2">
      <div className="flex items-center gap-2.5">
        <div
          className={`h-2 w-2 rounded-full ${
            running
              ? "bg-[var(--success)] shadow-[0_0_10px_var(--success)]"
              : "bg-[var(--text-faint)]"
          }`}
          title={running ? "Agent connected" : "Agent disconnected"}
        />
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold tracking-wide">
            Grok Desk
          </span>
          <span className="text-[10px] text-[var(--text-faint)]">v{ver}</span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            activeBusy
              ? "bg-[var(--warning)]/15 text-[var(--warning)]"
              : activePermissionCount
                ? "bg-[var(--danger)]/15 text-[var(--danger)]"
                : running
                  ? "bg-[var(--success)]/12 text-[var(--success)]"
                  : "bg-[var(--bg-panel)] text-[var(--text-muted)]"
          }`}
        >
          {headerStatus}
        </span>
        {tierLabel ? (
          <span className="hidden rounded-full bg-[var(--accent)]/12 px-2 py-0.5 text-[11px] text-[var(--accent)] md:inline">
            {tierLabel}
          </span>
        ) : null}
        {updateAvailable && onOpenUpdates && (
          <button
            type="button"
            onClick={onOpenUpdates}
            className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/12 px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
            title="Update available"
          >
            Update
          </button>
        )}
        <button
          type="button"
          onClick={onShowShortcuts}
          className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
          title="Keyboard shortcuts (Ctrl+/)"
        >
          <span className="kbd">?</span>
        </button>
      </div>
    </header>
  );
}
