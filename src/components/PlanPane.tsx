import { useState } from "react";
import type { PlanApprovalRequest, PlanEntry } from "../types";
import { RichText } from "./RichText";

type Props = {
  plan: PlanEntry[];
  modeId?: string | null;
  planDoc?: string | null;
  planApproval?: PlanApprovalRequest | null;
  busy: boolean;
  /** When true, fill parent (no outer toggle chrome). */
  embedded?: boolean;
  open?: boolean;
  onToggle?: () => void;
  onEnterPlanMode: () => void;
  onApprove: () => void;
  onRevise: () => void;
  onRefreshDoc: () => void;
  onAbandonPlan?: () => void;
};

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "›";
    default:
      return "○";
  }
}

function statusClass(status: string) {
  switch (status) {
    case "completed":
      return "text-[var(--success)]";
    case "in_progress":
      return "text-[var(--warning)]";
    default:
      return "text-[var(--text-muted)]";
  }
}

export function PlanPane({
  plan,
  modeId,
  planDoc,
  planApproval,
  busy,
  embedded = false,
  open = true,
  onToggle,
  onEnterPlanMode,
  onApprove,
  onRevise,
  onRefreshDoc,
  onAbandonPlan,
}: Props) {
  const [docOpen, setDocOpen] = useState(false);
  const done = plan.filter((e) => e.status === "completed").length;
  const total = plan.length;
  const inPlanMode = modeId === "plan";
  const awaitingApproval = !!planApproval;
  const fullDoc = planApproval?.planContent || planDoc || null;

  const body = (
    <>
      {awaitingApproval && (
        <div className="space-y-2 border-b border-[var(--warning)]/35 bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-3">
          <div className="text-[11px] font-semibold tracking-wide text-[var(--warning)]">
            Plan ready — approve to implement
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            The agent is waiting on the ACP plan handshake. Approve to run, or
            request changes.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={onApprove}
              className="rounded-md bg-[var(--success)] px-2.5 py-1.5 text-[11px] font-medium text-black"
            >
              Approve & run
            </button>
            <button
              onClick={onRevise}
              className="rounded-md border border-[var(--warning)]/50 px-2.5 py-1.5 text-[11px] text-[var(--warning)] hover:bg-[var(--warning)]/10"
            >
              Request changes
            </button>
            {onAbandonPlan && (
              <button
                onClick={onAbandonPlan}
                className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Abandon
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] p-2.5">
        <button
          onClick={onEnterPlanMode}
          disabled={busy || awaitingApproval}
          className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[11px] hover:border-[var(--thought)] disabled:opacity-40"
        >
          Enter plan mode
        </button>
        <button
          onClick={onApprove}
          disabled={busy || (!awaitingApproval && total === 0 && !planDoc)}
          className="rounded-md bg-[var(--success)]/15 px-2.5 py-1.5 text-[11px] text-[var(--success)] hover:bg-[var(--success)]/25 disabled:opacity-40"
        >
          Approve & run
        </button>
        <button
          onClick={onRevise}
          disabled={busy || (!awaitingApproval && total === 0 && !planDoc)}
          className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[11px] hover:border-[var(--warning)] disabled:opacity-40"
        >
          Request changes
        </button>
        <button
          onClick={onRefreshDoc}
          className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)]"
          title="Reload plan.md from disk"
        >
          Reload doc
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {inPlanMode && !awaitingApproval && (
          <div className="mb-2 rounded-md bg-[var(--thought)]/10 px-2 py-1 text-[10px] font-medium text-[var(--thought)]">
            Plan mode active
          </div>
        )}

        {total === 0 && !planDoc ? (
          <div className="space-y-2 px-0.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
            <p>
              Write a goal in the composer, then{" "}
              <strong className="text-[var(--text)]">Enter plan mode</strong>.
              Steps stream here as the agent plans.
            </p>
            <p className="text-[11px]">
              Shortcut: <span className="kbd">Alt</span>
              <span className="mx-0.5 text-[var(--text-faint)]">+</span>
              <span className="kbd">P</span>
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {plan.map((entry, i) => (
              <li
                key={`${i}-${entry.content.slice(0, 24)}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mono mt-0.5 text-xs ${statusClass(entry.status)}`}
                  >
                    {statusIcon(entry.status)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] leading-snug text-[var(--text)]">
                      {entry.content}
                    </div>
                    <div className="mono mt-1 text-[10px] text-[var(--text-faint)]">
                      {entry.status}
                      {entry.priority ? ` · ${entry.priority}` : ""}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {total > 0 && (
          <div className="mono mt-2 text-[10px] text-[var(--text-faint)]">
            {done}/{total} complete
          </div>
        )}

        {fullDoc && (
          <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-2.5 py-1.5">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                plan.md
              </span>
              <button
                type="button"
                onClick={() => setDocOpen(true)}
                className="rounded px-2 py-0.5 text-[11px] text-[var(--accent)] hover:bg-[var(--accent)]/10"
              >
                Expand
              </button>
            </div>
            <pre className="mono max-h-40 overflow-auto whitespace-pre-wrap px-2.5 py-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
              {fullDoc.slice(0, 1200)}
              {fullDoc.length > 1200 ? "\n…" : ""}
            </pre>
          </div>
        )}
      </div>
    </>
  );

  const dialog =
    docOpen && fullDoc ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-[2px]"
        onClick={() => setDocOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setDocOpen(false)}
        role="presentation"
      >
        <div
          className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-panel)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Full plan document"
        >
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
            <span className="text-sm font-semibold">Plan document</span>
            <button
              type="button"
              onClick={() => setDocOpen(false)}
              className="ml-auto rounded-md border border-[var(--border)] px-3 py-1 text-xs hover:border-[var(--accent)]"
            >
              Close
            </button>
            {awaitingApproval && (
              <button
                type="button"
                onClick={() => {
                  setDocOpen(false);
                  onApprove();
                }}
                className="rounded-md bg-[var(--success)] px-3 py-1 text-xs font-medium text-black"
              >
                Approve & run
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <RichText text={fullDoc} />
          </div>
        </div>
      </div>
    ) : null;

  if (embedded) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        {dialog}
      </>
    );
  }

  return (
    <>
      <div
        className={`flex shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)] transition-all ${
          open ? "w-80" : "w-10"
        }`}
      >
        <button
          onClick={onToggle}
          className="flex items-center gap-2 border-b border-[var(--border)] px-2.5 py-2.5 text-left text-xs hover:bg-[var(--bg-hover)]"
          title="Toggle plan pane"
        >
          <span className="font-semibold tracking-wide text-[var(--accent)]">
            {open ? "Plan" : "P"}
          </span>
          {open && total > 0 && (
            <span className="mono ml-auto text-[10px] text-[var(--text-muted)]">
              {done}/{total}
            </span>
          )}
        </button>
        {open && body}
      </div>
      {dialog}
    </>
  );
}
