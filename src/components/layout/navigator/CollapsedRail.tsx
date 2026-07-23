import type { DeskSession, SessionPin } from "../../../types";
import {
  countRunningBackground,
  countRunningSubagents,
  countRunningTools,
} from "../../../activity";
import { folderName } from "../../../lib/format";

type Props = {
  running: boolean;
  connecting: boolean;
  grokAvailable: boolean;
  headerStatus: string;
  active: DeskSession | null;
  sessions: DeskSession[];
  activeId: string | null;
  pins: SessionPin[];
  isPinned: (sessionId: string, cwd?: string) => boolean;
  onToggleCollapse: () => void;
  onConnect: () => void;
  onSelectSession: (sessionId: string, cwd: string) => void;
  onToggleRecents: () => void;
};

export function CollapsedRail({
  running,
  connecting,
  grokAvailable,
  headerStatus,
  active,
  sessions,
  activeId,
  pins,
  isPinned,
  onToggleCollapse,
  onConnect,
  onSelectSession,
  onToggleRecents,
}: Props) {
  return (
    <aside
      className="flex w-12 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--bg-panel)] py-2"
      aria-label="Collapsed sidebar"
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        title="Expand sidebar (Ctrl+B / Alt+B)"
        className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        ›
      </button>
      <div
        className={`mb-2 h-2 w-2 rounded-full ${
          running
            ? active?.busy
              ? "status-pulse bg-[var(--warning)]"
              : "bg-[var(--success)]"
            : "bg-[var(--text-faint)]"
        }`}
        title={headerStatus}
      />
      {!running ? (
        <button
          type="button"
          onClick={() => void onConnect()}
          disabled={connecting || !grokAvailable}
          title="Connect"
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-xs font-bold text-[var(--accent-fg)] disabled:opacity-40"
        >
          {connecting ? "…" : "C"}
        </button>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
        {sessions.map((s) => {
          const selected = s.sessionId === activeId;
          const run = countRunningTools(s.tools);
          const sub = countRunningSubagents(s.subagents ?? []);
          const bg = countRunningBackground(s.backgroundTasks ?? []);
          const live = run > 0 || sub > 0 || bg > 0;
          return (
            <button
              key={s.sessionId}
              type="button"
              title={`${s.title}\n${s.cwd}`}
              onClick={() => onSelectSession(s.sessionId, s.cwd)}
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${
                selected
                  ? "bg-[var(--bg-active)] text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              }`}
            >
              {(s.title || folderName(s.cwd)).slice(0, 1).toUpperCase()}
              {s.busy || live ? (
                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
              ) : isPinned(s.sessionId, s.cwd) ? (
                <span className="absolute bottom-0.5 right-0.5 text-[7px] text-[var(--accent)]">
                  •
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {pins.length > 0 && sessions.length === 0 && (
        <button
          type="button"
          onClick={onToggleCollapse}
          title={`${pins.length} pinned — expand to open`}
          className="mb-1 text-[10px] text-[var(--accent)]"
        >
          📌{pins.length}
        </button>
      )}
      <button
        type="button"
        onClick={onToggleRecents}
        title="Recents"
        className="mt-auto flex h-8 w-8 items-center justify-center rounded-md text-[10px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
      >
        ☰
      </button>
    </aside>
  );
}
