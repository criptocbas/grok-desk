import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BackgroundTaskItem, ToolCallItem } from "../types";
import {
  countRunningBackground,
  countRunningTools,
  formatDuration,
  isToolDone,
  isToolFailed,
  isToolRunning,
  kindAccentClass,
} from "../activity";

type Props = {
  tools: ToolCallItem[];
  backgroundTasks: BackgroundTaskItem[];
  busy: boolean;
};

const RECENT_LIMIT = 20;

export function ActivityPane({ tools, backgroundTasks, busy }: Props) {
  const runningCount = countRunningTools(tools);
  const bgRunning = countRunningBackground(backgroundTasks);
  const live = runningCount + bgRunning;

  const [open, setOpen] = useState(busy || live > 0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Auto-open when work starts
  useEffect(() => {
    if (busy || live > 0) setOpen(true);
  }, [busy, live]);

  // Tick durations while something is live
  useEffect(() => {
    if (live === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  const { runningTools, recentTools } = useMemo(() => {
    const running: ToolCallItem[] = [];
    const recent: ToolCallItem[] = [];
    for (const t of tools) {
      if (isToolRunning(t.status)) running.push(t);
      else recent.push(t);
    }
    // Newest last in array → reverse for display
    running.reverse();
    recent.reverse();
    return { runningTools: running, recentTools: recent };
  }, [tools]);

  const runningBg = useMemo(
    () => backgroundTasks.filter((t) => t.status === "running").reverse(),
    [backgroundTasks],
  );
  const recentBg = useMemo(
    () =>
      backgroundTasks
        .filter((t) => t.status !== "running")
        .slice()
        .reverse(),
    [backgroundTasks],
  );

  const recentCombined = useMemo(() => {
    type Row =
      | { kind: "tool"; tool: ToolCallItem; at: number }
      | { kind: "bg"; task: BackgroundTaskItem; at: number };
    const rows: Row[] = [
      ...recentTools.map((tool) => ({
        kind: "tool" as const,
        tool,
        at: tool.endedAt ?? tool.startedAt ?? 0,
      })),
      ...recentBg.map((task) => ({
        kind: "bg" as const,
        task,
        at: task.endedAt ?? task.startedAt ?? 0,
      })),
    ];
    rows.sort((a, b) => b.at - a.at);
    return rows;
  }, [recentTools, recentBg]);

  const recentShown = showAllRecent
    ? recentCombined
    : recentCombined.slice(0, RECENT_LIMIT);

  const headerMeta = [
    live > 0 ? `${live} live` : null,
    runningBg.length > 0 ? `${runningBg.length} bg` : null,
    recentTools.filter((t) => isToolFailed(t.status)).length
      ? `${recentTools.filter((t) => isToolFailed(t.status)).length} fail`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="border-t border-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)]"
        aria-expanded={open}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            live > 0
              ? "animate-pulse bg-[var(--warning)]"
              : "bg-[var(--text-faint)]"
          }`}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          Activity
        </span>
        {headerMeta && (
          <span
            className="mono ml-auto text-[10px] text-[var(--text-muted)]"
            aria-live="polite"
          >
            {headerMeta}
          </span>
        )}
        <span className="text-[10px] text-[var(--text-faint)]">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="max-h-64 overflow-y-auto px-2 pb-2">
          {tools.length === 0 && backgroundTasks.length === 0 ? (
            <p className="px-1 py-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Tool calls, subagents, and background tasks show up here while the
              agent works.
            </p>
          ) : (
            <div className="space-y-2">
              {(runningTools.length > 0 || runningBg.length > 0) && (
                <Section label="Running">
                  {runningBg.map((task) => (
                    <BgRow
                      key={`bg-${task.taskId}`}
                      task={task}
                      now={now}
                      expanded={expandedId === `bg-${task.taskId}`}
                      onToggle={() =>
                        setExpandedId((id) =>
                          id === `bg-${task.taskId}`
                            ? null
                            : `bg-${task.taskId}`,
                        )
                      }
                    />
                  ))}
                  {runningTools.map((tool) => (
                    <ToolRow
                      key={tool.id}
                      tool={tool}
                      now={now}
                      expanded={expandedId === tool.id}
                      onToggle={() =>
                        setExpandedId((id) =>
                          id === tool.id ? null : tool.id,
                        )
                      }
                    />
                  ))}
                </Section>
              )}

              {recentShown.length > 0 && (
                <Section label="Recent">
                  {recentShown.map((row) =>
                    row.kind === "tool" ? (
                      <ToolRow
                        key={row.tool.id}
                        tool={row.tool}
                        now={now}
                        expanded={expandedId === row.tool.id}
                        onToggle={() =>
                          setExpandedId((id) =>
                            id === row.tool.id ? null : row.tool.id,
                          )
                        }
                      />
                    ) : (
                      <BgRow
                        key={`bg-${row.task.taskId}`}
                        task={row.task}
                        now={now}
                        expanded={expandedId === `bg-${row.task.taskId}`}
                        onToggle={() =>
                          setExpandedId((id) =>
                            id === `bg-${row.task.taskId}`
                              ? null
                              : `bg-${row.task.taskId}`,
                          )
                        }
                      />
                    ),
                  )}
                  {recentCombined.length > RECENT_LIMIT && (
                    <button
                      type="button"
                      onClick={() => setShowAllRecent((v) => !v)}
                      className="w-full py-1 text-center text-[10px] text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                    >
                      {showAllRecent
                        ? "Show less"
                        : `Show more (${recentCombined.length - RECENT_LIMIT})`}
                    </button>
                  )}
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="px-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
        {label}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function ToolRow({
  tool,
  now,
  expanded,
  onToggle,
}: {
  tool: ToolCallItem;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const running = isToolRunning(tool.status);
  const failed = isToolFailed(tool.status);
  const done = isToolDone(tool.status);
  const ms =
    tool.startedAt != null
      ? (tool.endedAt ?? (running ? now : tool.startedAt)) - tool.startedAt
      : null;
  const dur = formatDuration(ms ?? undefined);
  const accent = kindAccentClass(tool.kind, tool.category);
  const chip =
    tool.category === "subagent"
      ? "sub"
      : tool.kind?.slice(0, 4) || tool.name?.slice(0, 4) || "tool";

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`mono shrink-0 rounded bg-[var(--bg)] px-1 py-0.5 text-[9px] uppercase ${accent}`}
          >
            {chip}
          </span>
          <span className={`min-w-0 flex-1 truncate text-[11px] font-medium ${accent}`}>
            {tool.title}
          </span>
          <span
            className={`mono shrink-0 text-[10px] ${
              failed
                ? "text-[var(--danger)]"
                : done
                  ? "text-[var(--success)]"
                  : running
                    ? "text-[var(--warning)]"
                    : "text-[var(--text-faint)]"
            }`}
          >
            {normalizeLabel(tool.status)}
            {dur ? ` · ${dur}` : ""}
          </span>
        </div>
        {tool.detail && (
          <div className="mono truncate pl-1 text-[10px] text-[var(--text-faint)]">
            {tool.detail}
          </div>
        )}
        {expanded && (
          <div className="mt-0.5 space-y-0.5 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[10px] text-[var(--text-muted)]">
            {tool.name && (
              <div>
                <span className="text-[var(--text-faint)]">tool </span>
                <span className="mono">{tool.name}</span>
              </div>
            )}
            {tool.kind && (
              <div>
                <span className="text-[var(--text-faint)]">kind </span>
                {tool.kind}
              </div>
            )}
            {tool.locations?.map((l) => (
              <div key={l.path} className="mono break-all">
                {l.path}
              </div>
            ))}
            {tool.category === "subagent" && (
              <div className="text-[var(--thought)]">Subagent spawn</div>
            )}
            {!tool.detail && !tool.locations?.length && (
              <div className="text-[var(--text-faint)]">No extra detail</div>
            )}
          </div>
        )}
      </button>
    </li>
  );
}

function BgRow({
  task,
  now,
  expanded,
  onToggle,
}: {
  task: BackgroundTaskItem;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const running = task.status === "running";
  const failed = task.status === "failed";
  const ms =
    task.startedAt != null
      ? (task.endedAt ?? (running ? now : task.startedAt)) - task.startedAt
      : null;
  const dur = formatDuration(ms ?? undefined);
  const title =
    task.description ||
    (task.command ? task.command.split("\n")[0] : null) ||
    task.taskId.slice(0, 12);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
      >
        <div className="flex items-center gap-1.5">
          <span className="mono shrink-0 rounded bg-[var(--warning)]/15 px-1 py-0.5 text-[9px] uppercase text-[var(--warning)]">
            bg
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--warning)]">
            {title}
          </span>
          <span
            className={`mono shrink-0 text-[10px] ${
              failed
                ? "text-[var(--danger)]"
                : running
                  ? "text-[var(--warning)]"
                  : "text-[var(--success)]"
            }`}
          >
            {task.status}
            {dur ? ` · ${dur}` : ""}
          </span>
        </div>
        {task.command && (
          <div className="mono truncate pl-1 text-[10px] text-[var(--text-faint)]">
            {task.command}
          </div>
        )}
        {expanded && (
          <div className="mt-0.5 space-y-0.5 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[10px] text-[var(--text-muted)]">
            <div className="mono text-[var(--text-faint)]">{task.taskId}</div>
            {task.cwd && <div className="mono break-all">{task.cwd}</div>}
            {task.summary && (
              <pre className="mono max-h-20 overflow-auto whitespace-pre-wrap text-[var(--text-muted)]">
                {task.summary}
              </pre>
            )}
            {!task.summary && (
              <div className="text-[var(--text-faint)]">
                Background task (log on disk)
              </div>
            )}
          </div>
        )}
      </button>
    </li>
  );
}

function normalizeLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "in_progress") return "running";
  return s;
}
