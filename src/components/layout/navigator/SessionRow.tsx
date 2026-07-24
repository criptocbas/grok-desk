import type { DeskSession, SessionGroup } from "../../../types";
import {
  countRunningBackground,
  countRunningSubagents,
  countRunningTools,
} from "../../../activity";
import { folderName } from "../../../lib/format";
import { SessionTitleLabel } from "../../session/SessionTitleLabel";

export type SessionRowProps = {
  s: DeskSession;
  selected: boolean;
  pinned: boolean;
  groups: SessionGroup[];
  groupId: string | null;
  onSelectSession: (sessionId: string, cwd: string) => void;
  onCloseSession: (sessionId: string) => void;
  onPin: (sessionId: string, cwd: string, title?: string | null) => void;
  onUnpin: (sessionId: string, cwd?: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSetSessionGroup: (sessionId: string, groupId: string | null) => void;
};

export function SessionRow({
  s,
  selected,
  pinned,
  groups,
  groupId,
  onSelectSession,
  onCloseSession,
  onPin,
  onUnpin,
  onRenameSession,
  onSetSessionGroup,
}: SessionRowProps) {
  const statusLabel = s.busy
    ? "busy"
    : s.permissions.length
      ? "needs permission"
      : s.permissionMode === "always-approve"
        ? "always-approve"
        : "ready";

  return (
    <li>
      {/*
        Actions are position:absolute so opacity-0 controls don’t reserve
        flex width (group select alone was ~4.5rem of “empty” space).
      */}
      <div
        className={`group relative flex w-full items-start overflow-hidden rounded-lg border-l-2 px-1 py-1 transition ${
          selected
            ? "border-[var(--accent)] bg-[var(--bg-active)]"
            : "border-transparent hover:bg-[var(--bg-hover)]"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectSession(s.sessionId, s.cwd)}
          aria-current={selected ? "true" : undefined}
          aria-label={`${s.title}, ${statusLabel}`}
          className="flex min-w-0 w-full items-start gap-2 rounded-md px-1.5 py-1 pr-7 text-left"
        >
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              s.busy
                ? "status-pulse bg-[var(--warning)]"
                : s.permissions.length
                  ? "bg-[var(--danger)]"
                  : s.permissionMode === "always-approve"
                    ? "bg-[var(--warning)]"
                    : "bg-[var(--success)]"
            }`}
            title={statusLabel}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1 text-[11px] font-medium">
              {pinned && (
                <span
                  className="shrink-0 text-[10px] text-[var(--accent)]"
                  title="Pinned"
                  aria-hidden
                >
                  📌
                </span>
              )}
              <SessionTitleLabel
                title={s.title}
                className="min-w-0 flex-1 text-[11px] font-medium"
                onRename={(next) => onRenameSession(s.sessionId, next)}
              />
            </div>
            <div className="mono truncate text-[10px] text-[var(--text-muted)]">
              {folderName(s.cwd)}
              {(() => {
                const run = countRunningTools(s.tools);
                const bg = countRunningBackground(s.backgroundTasks ?? []);
                const sub = countRunningSubagents(s.subagents ?? []);
                if (sub > 0) return ` · ${sub} sub`;
                if (run > 0) return ` · ${run} run`;
                if (bg > 0) return ` · ${bg} bg`;
                if (s.plan.length > 0)
                  return ` · plan ${s.plan.filter((e) => e.status === "completed").length}/${s.plan.length}`;
                return "";
              })()}
            </div>
          </div>
        </button>
        <div className="pointer-events-none absolute top-0.5 right-0.5 z-10 flex items-start gap-0.5 rounded-md bg-[var(--bg-panel)]/95 py-0.5 pl-1 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          {groups.length > 0 && (
            <select
              title="Move to group"
              aria-label="Move session to group"
              value={groupId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onSetSessionGroup(s.sessionId, v === "" ? null : v);
              }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-[5.5rem] rounded border border-transparent bg-transparent py-0.5 text-[10px] text-[var(--text-faint)] hover:border-[var(--border)]"
            >
              <option value="">—</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            title={pinned ? "Unpin" : "Pin (keep after restart)"}
            aria-label={pinned ? "Unpin session" : "Pin session"}
            onClick={() => {
              if (pinned) void onUnpin(s.sessionId, s.cwd);
              else void onPin(s.sessionId, s.cwd, s.title);
            }}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              pinned
                ? "text-[var(--accent)]"
                : "text-[var(--text-faint)] hover:text-[var(--accent)]"
            }`}
          >
            📌
          </button>
          <button
            type="button"
            title="Close tab"
            aria-label="Close session"
            onClick={() => onCloseSession(s.sessionId)}
            className="rounded px-1.5 py-0.5 text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
          >
            ×
          </button>
        </div>
      </div>
    </li>
  );
}
