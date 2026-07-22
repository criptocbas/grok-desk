import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChatItem } from "../../types";
import { MessageBubble } from "./MessageBubble";

type Props = {
  items: ChatItem[];
  onOpenActivity?: () => void;
  onRetryUser?: (text: string) => void;
};

type Segment =
  | { kind: "item"; item: ChatItem }
  | {
      kind: "tool-group";
      id: string;
      tools: ChatItem[];
      subagents: ChatItem[];
    };

function isNoiseRole(role: ChatItem["role"]): boolean {
  return role === "tool" || role === "subagent";
}

function isRunning(item: ChatItem): boolean {
  const st = (item.status || item.meta || "").toLowerCase();
  return (
    st.includes("running") ||
    st.includes("in_progress") ||
    st.includes("pending") ||
    st.includes("background")
  );
}

function isFailed(item: ChatItem): boolean {
  const st = (item.status || item.meta || "").toLowerCase();
  return st.includes("fail") || st.includes("error");
}

/** Collapse consecutive tool/subagent rows into a single chip group. */
export function groupTranscriptItems(items: ChatItem[]): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (!isNoiseRole(item.role)) {
      out.push({ kind: "item", item });
      i += 1;
      continue;
    }
    const tools: ChatItem[] = [];
    const subagents: ChatItem[] = [];
    const start = i;
    while (i < items.length && isNoiseRole(items[i].role)) {
      if (items[i].role === "tool") tools.push(items[i]);
      else subagents.push(items[i]);
      i += 1;
    }
    // Single subagent card alone stays expanded (more signal)
    if (tools.length === 0 && subagents.length === 1) {
      out.push({ kind: "item", item: subagents[0] });
      continue;
    }
    // Single tool alone: still group so Heavy runs stay scannable
    out.push({
      kind: "tool-group",
      id: `group-${start}-${items[start]?.id ?? start}`,
      tools,
      subagents,
    });
  }
  return out;
}

function ToolGroupChip({
  tools,
  subagents,
  defaultOpen,
  onOpenActivity,
}: {
  tools: ChatItem[];
  subagents: ChatItem[];
  defaultOpen: boolean;
  onOpenActivity?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Auto-expand when tools start running or the turn is busy.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const total = tools.length + subagents.length;
  const running =
    tools.filter(isRunning).length + subagents.filter(isRunning).length;
  const failed =
    tools.filter(isFailed).length + subagents.filter(isFailed).length;

  const labelParts: string[] = [];
  if (tools.length > 0) {
    labelParts.push(
      `${tools.length} tool${tools.length === 1 ? "" : "s"}`,
    );
  }
  if (subagents.length > 0) {
    labelParts.push(
      `${subagents.length} subagent${subagents.length === 1 ? "" : "s"}`,
    );
  }
  const statusBits: string[] = [];
  if (running > 0) statusBits.push(`${running} running`);
  if (failed > 0) statusBits.push(`${failed} failed`);
  if (running === 0 && failed === 0) statusBits.push("done");

  return (
    <div className="rounded-xl border border-[var(--tool)]/20 bg-[var(--tool)]/5">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-[11px] text-[var(--tool)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-expanded={open}
        >
          <span className="mono shrink-0 rounded bg-[var(--tool)]/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
            {running > 0 ? "live" : "tools"}
          </span>
          <span className="min-w-0 truncate font-medium text-[var(--text)]">
            {labelParts.join(" · ")}
          </span>
          <span className="shrink-0 text-[var(--text-faint)]">
            · {statusBits.join(" · ")}
          </span>
          <span className="shrink-0 text-[var(--text-faint)]" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </button>
        {onOpenActivity && (
          <button
            type="button"
            onClick={onOpenActivity}
            className="shrink-0 rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:border-[var(--tool)] hover:text-[var(--tool)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            title="Open Activity pane"
          >
            Activity
          </button>
        )}
        {running > 0 && (
          <span
            className="status-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warning)]"
            aria-hidden
          />
        )}
      </div>
      {open && (
        <div className="space-y-1.5 border-t border-[var(--tool)]/15 px-3 py-2">
          {subagents.map((item) => (
            <MessageBubble key={item.id} item={item} />
          ))}
          {tools.map((item) => (
            <MessageBubble key={item.id} item={item} />
          ))}
          {total === 0 && (
            <div className="text-[10px] text-[var(--text-faint)]">Empty</div>
          )}
        </div>
      )}
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function MessageWithActions({
  item,
  onRetryUser,
}: {
  item: ChatItem;
  onRetryUser?: (text: string) => void;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  // Assistant: Copy is useful. User: "Edit" reuses the prompt — never "Retry"
  // (that word reads like something failed).
  const canCopy = item.role === "assistant" && Boolean(item.text?.trim());
  const canEdit = item.role === "user" && Boolean(item.text?.trim()) && !!onRetryUser;

  if (!canCopy && !canEdit) {
    return <MessageBubble item={item} />;
  }

  const alignEnd = item.role === "user";

  return (
    <div className="group relative">
      <MessageBubble item={item} />
      {/* Hover/focus only — avoid always-on chrome that looks like an error path. */}
      <div
        className={`mt-0.5 flex flex-wrap items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${
          alignEnd ? "justify-end" : ""
        }`}
      >
        {canCopy && (
          <button
            type="button"
            onClick={() => {
              void copyText(item.text).then((ok) => {
                if (!ok) return;
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              });
            }}
            className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-muted)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => onRetryUser?.(item.text)}
            className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-muted)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            title="Load this prompt into the composer to edit or send again"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

export function TranscriptList({
  items,
  onOpenActivity,
  onRetryUser,
}: Props) {
  const segments = useMemo(() => groupTranscriptItems(items), [items]);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {segments.map((seg) => {
        if (seg.kind === "item") {
          return (
            <MessageWithActions
              key={seg.item.id}
              item={seg.item}
              onRetryUser={onRetryUser}
            />
          );
        }
        const anyRunning =
          seg.tools.some(isRunning) || seg.subagents.some(isRunning);
        // Only auto-expand groups that still have live work (not every historic block).
        return (
          <ToolGroupChip
            key={seg.id}
            tools={seg.tools}
            subagents={seg.subagents}
            defaultOpen={anyRunning}
            onOpenActivity={onOpenActivity}
          />
        );
      })}
    </div>
  );
}
