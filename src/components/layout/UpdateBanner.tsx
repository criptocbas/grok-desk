import type { UpdateCheckResult } from "../../types";

type Props = {
  update: UpdateCheckResult;
  updating: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
  onOpenSettings?: () => void;
};

export function UpdateBanner({
  update,
  updating,
  onUpdate,
  onDismiss,
  onOpenSettings,
}: Props) {
  if (!update.updateAvailable && !updating) return null;

  const short =
    update.remoteCommitShort ?? update.remoteCommit?.slice(0, 7) ?? "…";
  const msg = update.remoteMessage?.trim();

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-[var(--accent)]/35 bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))] px-4 py-2 text-xs"
      role="status"
      aria-live="polite"
    >
      {updating ? (
        <span className="text-[var(--accent)]">
          Updating in the background (pull · rebuild · reinstall). Restart when
          the log says OK.
        </span>
      ) : (
        <span className="text-[var(--text)]">
          <span className="font-medium text-[var(--accent)]">Update available</span>
          {" · "}
          <span className="mono text-[var(--text-muted)]">{short}</span>
          {msg ? (
            <span className="text-[var(--text-muted)]"> — {msg.slice(0, 80)}</span>
          ) : null}
        </span>
      )}

      {!updating && update.canAutoUpdate && (
        <button
          type="button"
          onClick={onUpdate}
          className="rounded border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-2 py-0.5 font-medium text-[var(--accent)] hover:bg-[var(--accent)]/25"
        >
          Update now
        </button>
      )}
      {!updating && !update.canAutoUpdate && onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded border border-[var(--border)] px-2 py-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          How to update
        </button>
      )}
      {updating && onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded border border-[var(--border)] px-2 py-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          View log
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="ml-auto rounded border border-transparent px-2 py-0.5 text-[var(--text-faint)] hover:text-[var(--text-muted)]"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
