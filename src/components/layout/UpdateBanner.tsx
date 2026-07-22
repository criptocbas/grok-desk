import type { UpdateCheckResult, UpdatePhase } from "../../types";

type Props = {
  update: UpdateCheckResult;
  phase: UpdatePhase;
  onUpdate: () => void;
  onRestart: () => void;
  onDismiss: () => void;
  onOpenSettings?: () => void;
};

export function UpdateBanner({
  update,
  phase,
  onUpdate,
  onRestart,
  onDismiss,
  onOpenSettings,
}: Props) {
  const updating = phase === "running";
  const ready = phase === "ready";
  const failed = phase === "failed";

  if (!update.updateAvailable && phase === "idle") return null;

  const short =
    update.remoteCommitShort ?? update.remoteCommit?.slice(0, 7) ?? "…";
  const msg = update.remoteMessage?.trim();

  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs ${
        ready
          ? "border-[var(--success)]/40 bg-[color-mix(in_srgb,var(--success)_10%,var(--bg))]"
          : failed
            ? "border-[var(--danger)]/40 bg-[var(--bg-danger-subtle)]"
            : "border-[var(--accent)]/35 bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))]"
      }`}
      role="status"
      aria-live="polite"
    >
      {ready ? (
        <span className="text-[var(--success)]">
          Update installed — restart to run the new build.
        </span>
      ) : failed ? (
        <span className="text-[var(--danger)]">
          Update failed — open Settings for the log, or try again.
        </span>
      ) : updating ? (
        <span className="text-[var(--accent)]">
          Updating in the background (pull · rebuild · reinstall)…
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

      {ready && (
        <button
          type="button"
          onClick={onRestart}
          className="rounded border border-[var(--success)]/50 bg-[var(--success)]/15 px-2 py-0.5 font-medium text-[var(--success)] hover:bg-[var(--success)]/25"
        >
          Restart now
        </button>
      )}
      {failed && update.canAutoUpdate && (
        <button
          type="button"
          onClick={onUpdate}
          className="rounded border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-2 py-0.5 font-medium text-[var(--accent)] hover:bg-[var(--accent)]/25"
        >
          Retry update
        </button>
      )}
      {!updating && !ready && !failed && update.canAutoUpdate && (
        <button
          type="button"
          onClick={onUpdate}
          className="rounded border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-2 py-0.5 font-medium text-[var(--accent)] hover:bg-[var(--accent)]/25"
        >
          Update now
        </button>
      )}
      {!updating && !ready && !failed && !update.canAutoUpdate && onOpenSettings && (
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
