import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  BackgroundTaskItem,
  SubagentItem,
  ToolCallItem,
} from "../types";
import {
  countRunningBackground,
  countRunningSubagents,
  countRunningTools,
  formatDuration,
  isSpawnSubagentTool,
  isSubagentDone,
  isSubagentRunning,
  isToolDone,
  isToolFailed,
  isToolRunning,
  kindAccentClass,
  subagentDisplayTitle,
  subagentTypeChip,
} from "../activity";
import { shortId } from "../lib/format";

type Props = {
  tools: ToolCallItem[];
  backgroundTasks: BackgroundTaskItem[];
  subagents?: SubagentItem[];
  busy: boolean;
  /** Fill parent (utility rail) — always expanded, no collapsible chrome. */
  embedded?: boolean;
};

const RECENT_LIMIT = 20;

export function ActivityPane({
  tools,
  backgroundTasks,
  subagents = [],
  busy,
  embedded = false,
}: Props) {
  const runningCount = countRunningTools(tools);
  const bgRunning = countRunningBackground(backgroundTasks);
  const subRunning = countRunningSubagents(subagents);
  const live = runningCount + bgRunning + subRunning;

  const [open, setOpen] = useState(busy || live > 0 || embedded);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (busy || live > 0) setOpen(true);
  }, [busy, live]);

  useEffect(() => {
    if (live === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  const { runningTools, recentTools } = useMemo(() => {
    const running: ToolCallItem[] = [];
    const recent: ToolCallItem[] = [];
    for (const t of tools) {
      // Prefer Subagents section for spawn tools — hide from generic tool lists
      if (isSpawnSubagentTool(t.name, t.title) || t.category === "subagent") {
        continue;
      }
      if (isToolRunning(t.status)) running.push(t);
      else recent.push(t);
    }
    running.reverse();
    recent.reverse();
    return { runningTools: running, recentTools: recent };
  }, [tools]);

  const runningSubs = useMemo(
    () => subagents.filter((s) => isSubagentRunning(s.status)).slice().reverse(),
    [subagents],
  );
  const recentSubs = useMemo(
    () =>
      subagents
        .filter((s) => !isSubagentRunning(s.status))
        .slice()
        .reverse(),
    [subagents],
  );

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
      | { kind: "bg"; task: BackgroundTaskItem; at: number }
      | { kind: "sub"; sub: SubagentItem; at: number };
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
      ...recentSubs.map((sub) => ({
        kind: "sub" as const,
        sub,
        at: sub.endedAt ?? sub.startedAt ?? 0,
      })),
    ];
    rows.sort((a, b) => b.at - a.at);
    return rows;
  }, [recentTools, recentBg, recentSubs]);

  const recentShown = showAllRecent
    ? recentCombined
    : recentCombined.slice(0, RECENT_LIMIT);

  const headerMeta = [
    live > 0 ? `${live} live` : null,
    subRunning > 0 ? `${subRunning} sub` : null,
    runningBg.length > 0 ? `${runningBg.length} bg` : null,
    recentTools.filter((t) => isToolFailed(t.status)).length
      ? `${recentTools.filter((t) => isToolFailed(t.status)).length} fail`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const empty =
    tools.length === 0 &&
    backgroundTasks.length === 0 &&
    subagents.length === 0;

  const feed = (
    <div className="space-y-2">
      {runningSubs.length > 0 && (
        <Section label="Subagents">
          {runningSubs.map((sub) => (
            <SubagentRow
              key={sub.subagentId}
              sub={sub}
              now={now}
              expanded={expandedId === `sub-${sub.subagentId}`}
              onToggle={() =>
                setExpandedId((id) =>
                  id === `sub-${sub.subagentId}`
                    ? null
                    : `sub-${sub.subagentId}`,
                )
              }
            />
          ))}
        </Section>
      )}

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
                  id === `bg-${task.taskId}` ? null : `bg-${task.taskId}`,
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
                setExpandedId((id) => (id === tool.id ? null : tool.id))
              }
            />
          ))}
        </Section>
      )}

      {recentShown.length > 0 && (
        <Section label="Recent">
          {recentShown.map((row) =>
            row.kind === "sub" ? (
              <SubagentRow
                key={`sub-${row.sub.subagentId}`}
                sub={row.sub}
                now={now}
                expanded={expandedId === `sub-${row.sub.subagentId}`}
                onToggle={() =>
                  setExpandedId((id) =>
                    id === `sub-${row.sub.subagentId}`
                      ? null
                      : `sub-${row.sub.subagentId}`,
                  )
                }
              />
            ) : row.kind === "bg" ? (
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
            ) : (
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
            ),
          )}
          {recentCombined.length > RECENT_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllRecent((v) => !v)}
              className="w-full rounded px-1 py-1 text-left text-[10px] text-[var(--text-faint)] hover:text-[var(--text-muted)]"
            >
              {showAllRecent
                ? "Show less"
                : `Show all recent (${recentCombined.length})`}
            </button>
          )}
        </Section>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              live > 0
                ? "status-pulse bg-[var(--warning)]"
                : "bg-[var(--text-faint)]"
            }`}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            Live feed
          </span>
          {headerMeta && (
            <span
              className="mono ml-auto text-[10px] text-[var(--text-muted)]"
              aria-live="polite"
            >
              {headerMeta}
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {empty ? (
            <p className="px-1 py-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Subagents, tools, and background tasks show up here while the
              agent works.
            </p>
          ) : (
            feed
          )}
        </div>
      </div>
    );
  }

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
          {empty ? (
            <p className="px-1 py-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Subagents, tools, and background tasks show up here while the
              agent works.
            </p>
          ) : (
            feed
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

function SubagentRow({
  sub,
  now,
  expanded,
  onToggle,
}: {
  sub: SubagentItem;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const running = isSubagentRunning(sub.status);
  const failed = sub.status === "failed";
  const done = isSubagentDone(sub.status);
  const ms =
    sub.durationMs != null
      ? sub.durationMs
      : sub.startedAt != null
        ? (sub.endedAt ?? (running ? now : sub.startedAt)) - sub.startedAt
        : null;
  const dur = formatDuration(ms ?? undefined);
  const chip = subagentTypeChip(sub.subagentType);
  const title = subagentDisplayTitle(sub);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
        title={title}
      >
        <div className="flex items-center gap-1.5">
          <span className="mono shrink-0 rounded bg-[var(--thought)]/15 px-1 py-0.5 text-[9px] uppercase text-[var(--thought)]">
            {chip}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--thought)]">
            {title}
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
            {sub.status}
            {dur ? ` · ${dur}` : ""}
          </span>
        </div>
        {(sub.model || sub.resumedFrom || sub.subagentType) && (
          <div className="mono truncate pl-1 text-[10px] text-[var(--text-faint)]">
            {[sub.subagentType, sub.model, sub.resumedFrom ? "resumed" : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
        {expanded && (
          <div className="mt-0.5 space-y-0.5 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[10px] text-[var(--text-muted)]">
            {sub.description && sub.description !== title && (
              <div>
                <span className="text-[var(--text-faint)]">task </span>
                {sub.description}
              </div>
            )}
            {sub.subagentType && (
              <div>
                <span className="text-[var(--text-faint)]">type </span>
                {sub.subagentType}
              </div>
            )}
            {sub.model && (
              <div>
                <span className="text-[var(--text-faint)]">model </span>
                <span className="mono">{sub.model}</span>
              </div>
            )}
            <div className="mono text-[var(--text-faint)]">
              {shortId(sub.subagentId)}
            </div>
            {sub.resumedFrom && (
              <div>
                <span className="text-[var(--text-faint)]">resumed </span>
                <span className="mono">{shortId(sub.resumedFrom)}</span>
              </div>
            )}
            {sub.toolCalls != null && (
              <div>
                <span className="text-[var(--text-faint)]">tools </span>
                {sub.toolCalls}
                {sub.turns != null ? ` · ${sub.turns} turns` : ""}
              </div>
            )}
            {sub.outputSummary && (
              <pre className="mono max-h-20 overflow-auto whitespace-pre-wrap text-[var(--text-muted)]">
                {sub.outputSummary}
              </pre>
            )}
            {!sub.outputSummary && running && (
              <div className="text-[var(--text-faint)]">Running…</div>
            )}
          </div>
        )}
      </button>
    </li>
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
          <span
            className={`min-w-0 flex-1 truncate text-[11px] font-medium ${accent}`}
          >
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
