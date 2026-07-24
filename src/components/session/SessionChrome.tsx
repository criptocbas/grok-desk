import { useEffect, useId, useRef, useState } from "react";
import type {
  DeskSession,
  EffortOption,
  ModelOption,
  PermissionMode,
} from "../../types";
import type { InspectorTab } from "../InspectorRail";
import { SessionTitleLabel } from "./SessionTitleLabel";

const CONTROLS_KEY = "grok-desk.chrome.controlsOpen";

function loadControlsOpen(): boolean {
  try {
    return localStorage.getItem(CONTROLS_KEY) === "1";
  } catch {
    return false;
  }
}

function saveControlsOpen(open: boolean) {
  try {
    localStorage.setItem(CONTROLS_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

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
  onInspectorTab: (
    tab: InspectorTab | null | ((t: InspectorTab | null) => InspectorTab | null),
  ) => void;
  fileTreeOpen?: boolean;
  onToggleFileTree?: () => void;
};

function shortModelName(name: string) {
  return name.replace(/^Grok\s+/i, "").trim() || name;
}

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
  const [controlsOpen, setControlsOpen] = useState(loadControlsOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const controlsId = useId();

  useEffect(() => {
    saveControlsOpen(controlsOpen);
  }, [controlsOpen]);

  useEffect(() => {
    if (!controlsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) {
        setControlsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setControlsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [controlsOpen]);

  const modelId = session.modelId || infoModelId || "";
  const modelOpt = sessionModels.find((m) => m.modelId === modelId);
  const modelLabel = shortModelName(
    modelOpt?.name || modelId || "Model",
  );
  const effortVal = session.reasoningEffort || infoEffort || "high";
  const effortLabel =
    effortOptions.find((e) => (e.value || e.id) === effortVal)?.label ||
    effortVal;
  const permsLabel =
    session.permissionMode === "always-approve" ? "Always" : "Ask";
  const summaryParts = [modelLabel];
  if (supportsEffort) summaryParts.push(effortLabel);
  summaryParts.push(permsLabel);
  const controlsSummary = summaryParts.join(" · ");

  const showReviewChip = reviewCount > 0 && inspectorTab !== "diff";
  const showGitChip = gitFileCount > 0 && inspectorTab !== "diff";
  const showPlanBadge = planBadge && inspectorTab !== "plan";
  const showDiffBadge = diffBadge && inspectorTab !== "diff";

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/80">
      {/* Row 1 — identity + attention */}
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
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
              isPinned
                ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-[var(--accent)]"
            }`}
            title={
              isPinned
                ? "Unpin — won’t auto-open on next launch"
                : "Pin — reopen after Desk restart"
            }
            aria-pressed={isPinned}
          >
            {isPinned ? "Pinned" : "Pin"}
          </button>
          {session.modeId === "plan" && (
            <span className="rounded-full bg-[var(--thought)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--thought)]">
              plan mode
            </span>
          )}
          {showReviewChip && (
            <button
              type="button"
              onClick={() => onInspectorTab("diff")}
              className="rounded-full bg-[var(--warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--warning)] hover:bg-[var(--warning)]/25"
            >
              {reviewCount} review
            </button>
          )}
          {showGitChip && (
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

      {/* Row 2 — compact controls + rail toggles */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)]/70 px-4 py-1.5">
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            id={controlsId}
            aria-expanded={controlsOpen}
            aria-haspopup="dialog"
            onClick={() => setControlsOpen((v) => !v)}
            title="Model, effort, permissions"
            className={`max-w-[min(20rem,50vw)] truncate rounded-md border px-2 py-1 text-left text-[11px] font-medium transition ${
              controlsOpen
                ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                : session.permissionMode === "always-approve"
                  ? "border-[var(--warning)]/40 text-[var(--warning)] hover:bg-[var(--bg-hover)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            }`}
          >
            {controlsSummary}
            <span className="ml-1.5 text-[var(--text-faint)]" aria-hidden>
              {controlsOpen ? "▴" : "▾"}
            </span>
          </button>

          {controlsOpen && (
            <div
              role="dialog"
              aria-labelledby={controlsId}
              className="absolute left-0 top-full z-30 mt-1 min-w-[16rem] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow-panel)]"
            >
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                Session controls
              </div>
              <div className="flex flex-col gap-2.5">
                <label className="flex flex-col gap-1" title="Session model">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                    Model
                  </span>
                  <select
                    value={modelId}
                    disabled={session.busy || sessionModels.length === 0}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (!next) return;
                      onApplyModel(
                        session.sessionId,
                        next,
                        session.reasoningEffort,
                      );
                    }}
                    className="ctrl-select max-w-none w-full"
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
                    className="flex flex-col gap-1"
                    title="Reasoning effort"
                  >
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                      Effort
                    </span>
                    <select
                      value={effortVal}
                      disabled={session.busy || !session.modelId}
                      onChange={(e) => {
                        const mid = session.modelId || infoModelId;
                        if (!mid) return;
                        onApplyModel(session.sessionId, mid, e.target.value);
                      }}
                      className="ctrl-select max-w-none w-full"
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
                  className="flex flex-col gap-1"
                  title="Tool permission policy for this tab"
                >
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                    Permissions
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
                    className={`ctrl-select max-w-none w-full ${
                      session.permissionMode === "always-approve"
                        ? "border-[var(--warning)]/50 text-[var(--warning)]"
                        : ""
                    }`}
                  >
                    <option value="default">Ask</option>
                    <option value="always-approve">Always approve</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>

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
            {showPlanBadge ? (
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
            {showDiffBadge ? (
              <span className="mono ml-1 opacity-70">{diffBadge}</span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}
