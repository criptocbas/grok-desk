import type { ChatItem } from "../../types";
import { RichText } from "../RichText";

export function MessageBubble({ item }: { item: ChatItem }) {
  if (item.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-[var(--text)]">
          {item.text}
        </div>
      </div>
    );
  }
  if (item.role === "thought") {
    return (
      <details className="rounded-xl border border-[var(--thought)]/18 bg-[var(--thought)]/5 px-3 py-2 text-xs leading-relaxed text-[var(--thought)]">
        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider opacity-70">
          Thinking
          {item.text.length > 200
            ? ` · ${Math.round(item.text.length / 1000)}k chars`
            : ""}
        </summary>
        <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap opacity-90">
          {item.text}
        </div>
      </details>
    );
  }
  if (item.role === "tool") {
    const st = (item.meta || item.status || "").toLowerCase();
    return (
      <div className="mono flex items-center gap-2 text-[11px] text-[var(--tool)]">
        <span className="rounded-md bg-[var(--tool)]/10 px-1.5 py-0.5 text-[10px]">
          tool
        </span>
        <span className="min-w-0 truncate">{item.text}</span>
        {item.meta && (
          <span
            className={
              st === "completed" || st === "success" || st === "done"
                ? "text-[var(--success)]"
                : st === "failed" || st === "error"
                  ? "text-[var(--danger)]"
                  : st === "in_progress" ||
                      st === "pending" ||
                      st === "background"
                    ? "text-[var(--warning)]"
                    : "text-[var(--text-faint)]"
            }
          >
            · {item.meta === "in_progress" ? "running" : item.meta}
          </span>
        )}
      </div>
    );
  }
  if (item.role === "system") {
    return (
      <div className="text-center text-[11px] text-[var(--text-faint)]">
        {item.text}
      </div>
    );
  }
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bg-panel)] px-3.5 py-2.5 text-[var(--text)] shadow-[0_1px_0_rgba(0,0,0,0.12)]">
      <RichText text={item.text} />
    </div>
  );
}
