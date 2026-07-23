import type { DiskSession } from "../../../types";
import { folderName, formatTime } from "../../../lib/format";
import { resolveSessionTitle } from "../../../lib/sessionTitle";
import { SessionTitleLabel } from "../../session/SessionTitleLabel";

type Props = {
  show: boolean;
  diskSessions: DiskSession[];
  running: boolean;
  grokAvailable: boolean;
  isPinned: (sessionId: string, cwd?: string) => boolean;
  onResumeDisk: (d: DiskSession) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onPin: (sessionId: string, cwd: string, title?: string | null) => void;
  onUnpin: (sessionId: string, cwd?: string) => void;
};

export function RecentsSection({
  show,
  diskSessions,
  running,
  grokAvailable,
  isPinned,
  onResumeDisk,
  onRenameSession,
  onPin,
  onUnpin,
}: Props) {
  if (!show) return null;

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        From disk
      </div>
      <ul className="space-y-1">
        {diskSessions.slice(0, 15).map((d) => {
          const pinned = isPinned(d.sessionId, d.cwd);
          const displayTitle = resolveSessionTitle(d.cwd, d.title);
          return (
            <li key={d.sessionId} className="group flex items-start gap-0.5">
              <button
                type="button"
                onClick={() => void onResumeDisk(d)}
                disabled={!running && !grokAvailable}
                className="min-w-0 flex-1 rounded-md px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] disabled:opacity-40"
              >
                <div className="flex items-center gap-1 truncate text-[11px] font-medium">
                  {pinned && (
                    <span className="text-[var(--accent)]">📌</span>
                  )}
                  <SessionTitleLabel
                    title={displayTitle}
                    className="text-[11px] font-medium"
                    onRename={(next) => onRenameSession(d.sessionId, next)}
                  />
                </div>
                <div className="mono truncate text-[10px] text-[var(--text-muted)]">
                  {folderName(d.cwd)} · {formatTime(d.updatedAt)}
                </div>
              </button>
              <button
                type="button"
                title={pinned ? "Unpin" : "Pin session"}
                onClick={() => {
                  if (pinned) {
                    void onUnpin(d.sessionId, d.cwd);
                  } else {
                    void onPin(d.sessionId, d.cwd, displayTitle);
                  }
                }}
                className={`mt-2 shrink-0 rounded px-1.5 text-[11px] ${
                  pinned
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-faint)] opacity-0 group-hover:opacity-100 hover:text-[var(--accent)]"
                }`}
              >
                📌
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
