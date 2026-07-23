import type { DeskSession } from "../../types";
import { resolveSessionTitle } from "../../lib/sessionTitle";
import { sessionStatus } from "../../lib/sessionStatus";

type Props = {
  sessions: DeskSession[];
  activeId: string | null;
  onSelect: (sessionId: string, cwd: string) => void;
  onClose: (sessionId: string) => void;
  onNewSession?: () => void;
  canNewSession?: boolean;
};

/**
 * Horizontal open-session tabs above SessionChrome.
 * Status dots mirror sidebar honesty (busy / permission / plan / watching).
 */
export function SessionTabStrip({
  sessions,
  activeId,
  onSelect,
  onClose,
  onNewSession,
  canNewSession = false,
}: Props) {
  if (sessions.length === 0) return null;

  return (
    <div
      className="flex shrink-0 items-stretch border-b border-[var(--border)] bg-[var(--bg)]"
      role="tablist"
      aria-label="Open sessions"
    >
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {sessions.map((s) => {
          const active = s.sessionId === activeId;
          const st = sessionStatus(s);
          const title = resolveSessionTitle(s.cwd, s.title);
          return (
            <div
              key={s.sessionId}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={`${title}\n${s.cwd}\n${st.label}`}
              className={`group flex max-w-[14rem] shrink-0 items-center gap-1.5 border-r border-[var(--border)] px-2.5 py-1.5 text-left ${
                active
                  ? "bg-[var(--bg-elevated)] text-[var(--text)]"
                  : "bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              } ${st.alert && !active ? "bg-[var(--bg-danger-subtle)]" : ""}`}
              onClick={() => onSelect(s.sessionId, s.cwd)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(s.sessionId, s.cwd);
                }
              }}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dotClass}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                {title}
              </span>
              <span className="sr-only">{st.label}</span>
              <button
                type="button"
                aria-label={`Close ${title}`}
                title="Close session"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(s.sessionId);
                }}
                className={`shrink-0 rounded px-1 text-[12px] leading-none text-[var(--text-faint)] opacity-0 hover:bg-[var(--bg-hover)] hover:text-[var(--danger)] group-hover:opacity-100 focus-visible:opacity-100 ${
                  active ? "opacity-60" : ""
                }`}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {onNewSession && (
        <button
          type="button"
          onClick={onNewSession}
          disabled={!canNewSession}
          title={canNewSession ? "New session (Ctrl+N)" : "Pick a project folder first"}
          className="shrink-0 border-l border-[var(--border)] px-2.5 text-[14px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-30"
          aria-label="New session"
        >
          +
        </button>
      )}
    </div>
  );
}
