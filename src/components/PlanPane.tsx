import type { PlanEntry } from "../types";

type Props = {
  plan: PlanEntry[];
  modeId?: string | null;
  planDoc?: string | null;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onEnterPlanMode: () => void;
  onApprove: () => void;
  onRevise: () => void;
  onRefreshDoc: () => void;
};

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "►";
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
  busy,
  open,
  onToggle,
  onEnterPlanMode,
  onApprove,
  onRevise,
  onRefreshDoc,
}: Props) {
  const done = plan.filter((e) => e.status === "completed").length;
  const total = plan.length;
  const inPlanMode = modeId === "plan";

  return (
    <div
      className={`flex shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)] transition-all ${
        open ? "w-80" : "w-10"
      }`}
    >
      <button
        onClick={onToggle}
        className="flex items-center gap-2 border-b border-[var(--border)] px-2.5 py-2.5 text-left text-xs hover:bg-white/5"
        title="Toggle plan pane"
      >
        <span className="font-semibold tracking-wide text-[var(--accent)]">
          {open ? "Plan" : "P"}
        </span>
        {open && (
          <>
            {inPlanMode && (
              <span className="rounded bg-[var(--thought)]/20 px-1.5 py-0.5 text-[10px] text-[var(--thought)]">
                plan mode
              </span>
            )}
            {total > 0 && (
              <span className="mono ml-auto text-[10px] text-[var(--text-muted)]">
                {done}/{total}
              </span>
            )}
          </>
        )}
      </button>

      {open && (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] p-2">
            <button
              onClick={onEnterPlanMode}
              disabled={busy}
              className="rounded border border-[var(--border)] px-2 py-1 text-[11px] hover:border-[var(--thought)] disabled:opacity-40"
            >
              Enter plan mode
            </button>
            <button
              onClick={onApprove}
              disabled={busy || total === 0}
              className="rounded bg-[var(--success)]/20 px-2 py-1 text-[11px] text-[var(--success)] hover:bg-[var(--success)]/30 disabled:opacity-40"
            >
              Approve & run
            </button>
            <button
              onClick={onRevise}
              disabled={busy || total === 0}
              className="rounded border border-[var(--border)] px-2 py-1 text-[11px] hover:border-[var(--warning)] disabled:opacity-40"
            >
              Request changes
            </button>
            <button
              onClick={onRefreshDoc}
              className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)]"
              title="Reload plan.md from disk"
            >
              ↻ doc
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {total === 0 && !planDoc ? (
              <p className="px-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                Type your goal in the message box, then click{" "}
                <strong>Enter plan mode</strong>. Steps from ACP{" "}
                <code className="mono">plan</code> / todos show here. When it
                looks right, <strong>Approve & run</strong>.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {plan.map((entry, i) => (
                  <li
                    key={`${i}-${entry.content.slice(0, 24)}`}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mono mt-0.5 text-xs ${statusClass(entry.status)}`}
                      >
                        {statusIcon(entry.status)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] leading-snug text-[var(--text)]">
                          {entry.content}
                        </div>
                        <div className="mono mt-0.5 text-[10px] text-[var(--text-muted)]">
                          {entry.status}
                          {entry.priority ? ` · ${entry.priority}` : ""}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {planDoc && (
              <details className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg)]">
                <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                  plan.md
                </summary>
                <pre className="mono max-h-64 overflow-auto whitespace-pre-wrap border-t border-[var(--border)] px-2 py-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                  {planDoc}
                </pre>
              </details>
            )}
          </div>
        </>
      )}
    </div>
  );
}
