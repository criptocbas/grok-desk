import type {
  DeskSession,
  EffortOption,
  ModelOption,
  PermissionMode,
} from "../../types";
import type { InspectorTab } from "../InspectorRail";
import { SessionTitleLabel } from "./SessionTitleLabel";

type Props = {
  session: DeskSession;
  isPinned: boolean;
  sessionModels: ModelOption[];
  supportsEffort: boolean;
  effortOptions: EffortOption[];
  infoModelId?: string | null;
  infoEffort?: string | null;
  planBadge?: string | null;
  diffBadge?: string | null;
  inspectorTab: InspectorTab | null;
  gitFileCount: number;
  onPinToggle: () => void;
  onRename: (title: string) => void;
  onApplyModel: (
    sessionId: string,
    modelId: string,
    effort?: string | null,
  ) => void;
  onPermissionMode: (sessionId: string, mode: PermissionMode) => void;
  onInspectorTab: (tab: InspectorTab | null | ((t: InspectorTab | null) => InspectorTab | null)) => void;
  /** Optional file-tree toggle (Alt+F). */
  fileTreeOpen?: boolean;
  onToggleFileTree?: () => void;
};

export function SessionChrome({
  session,
  isPinned,
  sessionModels,
  supportsEffort,
  effortOptions,
  infoModelId,
  infoEffort,
  planBadge,
  diffBadge,
  inspectorTab,
  gitFileCount,
  onPinToggle,
  onRename,
  onApplyModel,
  onPermissionMode,
  onInspectorTab,
  fileTreeOpen = false,
  onToggleFileTree,
}: Props) {
  const reviewCount = session.reviewComments?.length ?? 0;

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/80">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[var(--text)]">
            <SessionTitleLabel
              title={session.title}
              className="text-[13px] font-semibold"
              onRename={onRename}
            />
          </div>
          <div
            className="mono truncate text-[10px] text-[var(--text-faint)]"
            title={session.cwd}
          >
            {session.cwd}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onPinToggle}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              isPinned
                ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-[var(--accent)]"
            }`}
            title={
              isPinned
                ? "Unpin — won’t auto-open on next launch"
                : "Pin — reopen after Desk restart"
            }
          >
            {isPinned ? "📌 Pinned" : "Pin"}
          </button>
          {session.modeId === "plan" && (
            <span className="rounded-full bg-[var(--thought)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--thought)]">
              plan mode
            </span>
          )}
          {reviewCount > 0 && (
            <button
              type="button"
              onClick={() => onInspectorTab("diff")}
              className="rounded-full bg-[var(--warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--warning)] hover:bg-[var(--warning)]/25"
            >
              {reviewCount} review note
              {reviewCount === 1 ? "" : "s"}
            </button>
          )}
          {gitFileCount > 0 && (
            <button
              type="button"
              onClick={() => onInspectorTab("diff")}
              className="rounded-full bg-[var(--tool)]/12 px-2 py-0.5 text-[10px] font-medium text-[var(--tool)] hover:bg-[var(--tool)]/20"
            >
              {gitFileCount} changed
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)]/70 px-4 py-1.5">
        <label className="flex items-center gap-1.5" title="Session model">
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
            Model
          </span>
          <select
            value={session.modelId || infoModelId || ""}
            disabled={session.busy || sessionModels.length === 0}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              onApplyModel(session.sessionId, next, session.reasoningEffort);
            }}
            className="ctrl-select"
          >
            {sessionModels.length === 0 ? (
              <option value="">
                {session.modelId || infoModelId || "—"}
              </option>
            ) : (
              sessionModels.map((m) => (
                <option key={m.modelId} value={m.modelId}>
                  {m.name || m.modelId}
                </option>
              ))
            )}
          </select>
        </label>

        {supportsEffort && (
          <label
            className="flex items-center gap-1.5"
            title="Reasoning effort"
          >
            <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
              Effort
            </span>
            <select
              value={session.reasoningEffort || infoEffort || "high"}
              disabled={session.busy || !session.modelId}
              onChange={(e) => {
                const modelId = session.modelId || infoModelId;
                if (!modelId) return;
                onApplyModel(session.sessionId, modelId, e.target.value);
              }}
              className="ctrl-select"
            >
              {effortOptions.map((e) => (
                <option key={e.id || e.value} value={e.value || e.id}>
                  {e.label || e.value}
                </option>
              ))}
            </select>
          </label>
        )}

        <label
          className="flex items-center gap-1.5"
          title="Tool permission policy for this tab"
        >
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
            Perms
          </span>
          <select
            value={session.permissionMode || "default"}
            disabled={session.busy}
            onChange={(e) =>
              onPermissionMode(
                session.sessionId,
                e.target.value as PermissionMode,
              )
            }
            className={`ctrl-select ${
              session.permissionMode === "always-approve"
                ? "border-[var(--warning)]/50 text-[var(--warning)]"
                : ""
            }`}
          >
            <option value="default">Ask</option>
            <option value="always-approve">Always approve</option>
          </select>
        </label>

        <div className="ml-auto flex items-center gap-1">
          {onToggleFileTree && (
            <button
              type="button"
              onClick={onToggleFileTree}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                fileTreeOpen
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              }`}
              title="File tree (Alt+F)"
            >
              Files
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onInspectorTab((t) => (t === "plan" ? null : "plan"))
            }
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${
              inspectorTab === "plan"
                ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            }`}
            title="Plan (Alt+P)"
          >
            Plan
            {planBadge ? (
              <span className="mono ml-1 opacity-70">{planBadge}</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() =>
              onInspectorTab((t) => (t === "diff" ? null : "diff"))
            }
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${
              inspectorTab === "diff"
                ? "bg-[var(--tool)]/15 text-[var(--tool)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            }`}
            title="Diff (Alt+D)"
          >
            Diff
            {diffBadge ? (
              <span className="mono ml-1 opacity-70">{diffBadge}</span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}
