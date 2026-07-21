import type { QueuedPrompt } from "../../types";

type Props = {
  queue: QueuedPrompt[];
  busy: boolean;
  onClearAll: () => void;
  onRemove: (id: string) => void;
};

export function PromptQueue({ queue, busy, onClearAll, onRemove }: Props) {
  if (queue.length === 0) return null;

  return (
    <div className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[var(--text-muted)]">
          Queue · {queue.length}
          {busy ? " · runs after current turn" : ""}
        </span>
        <button
          type="button"
          onClick={onClearAll}
          className="text-[10px] text-[var(--text-faint)] hover:text-[var(--danger)]"
        >
          Clear all
        </button>
      </div>
      <ul className="space-y-1">
        {queue.map((q, i) => (
          <li
            key={q.id}
            className="flex items-start gap-2 rounded-md bg-[var(--bg-panel)] px-2 py-1 text-[11px]"
          >
            <span className="mono shrink-0 text-[var(--text-faint)]">
              {i + 1}.
            </span>
            <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">
              {q.displayText}
              {q.images.length > 0 ? ` · ${q.images.length} img` : ""}
            </span>
            <button
              type="button"
              onClick={() => onRemove(q.id)}
              className="shrink-0 text-[var(--text-faint)] hover:text-[var(--danger)]"
              title="Remove from queue"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
