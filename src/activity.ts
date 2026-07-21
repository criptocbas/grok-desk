import type { BackgroundTaskItem, ToolCallItem } from "./types";

export const MAX_TOOLS = 100;
export const MAX_BACKGROUND_TASKS = 40;
export const DETAIL_MAX = 200;
export const SUMMARY_MAX = 300;

export function normalizeToolStatus(status: string | undefined | null): string {
  const s = (status || "pending").toLowerCase();
  if (s === "success" || s === "done" || s === "completed") return "completed";
  if (s === "failed" || s === "error" || s === "cancelled" || s === "canceled")
    return "failed";
  if (s === "in_progress" || s === "running" || s === "pending" || s === "updated")
    return s === "updated" ? "in_progress" : s === "running" ? "in_progress" : s;
  if (s === "background" || s === "backgrounded") return "background";
  return s || "pending";
}

export function isToolDone(status: string): boolean {
  const s = normalizeToolStatus(status);
  return s === "completed" || s === "failed";
}

export function isToolRunning(status: string): boolean {
  const s = normalizeToolStatus(status);
  return (
    s === "pending" ||
    s === "in_progress" ||
    s === "background" ||
    s === "updated"
  );
}

export function isToolFailed(status: string): boolean {
  return normalizeToolStatus(status) === "failed";
}

export function formatDuration(ms: number | undefined | null): string {
  if (ms == null || ms < 0 || !Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m${s > 0 ? `${s}s` : ""}`;
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object") return v as Record<string, unknown>;
  return null;
}

/** Pull fields from a tool_call / tool_call_update payload. */
export function extractToolMeta(update: Record<string, unknown>): {
  id: string;
  title: string;
  name?: string;
  kind?: string;
  status: string;
  detail?: string;
  category: ToolCallItem["category"];
  locations?: { path: string }[];
} {
  const id =
    (typeof update.toolCallId === "string" && update.toolCallId) ||
    (typeof update.tool_call_id === "string" && update.tool_call_id) ||
    "";

  const metaRoot = asRecord(update._meta);
  const xaiTool = asRecord(metaRoot?.["x.ai/tool"]);
  const nameFromMeta =
    (typeof xaiTool?.name === "string" && xaiTool.name) || undefined;
  const kindFromMeta =
    (typeof xaiTool?.kind === "string" && xaiTool.kind) || undefined;
  const labelFromMeta =
    (typeof xaiTool?.label === "string" && xaiTool.label) || undefined;

  const titleRaw =
    (typeof update.title === "string" && update.title) ||
    (typeof update.tool === "string" && update.tool) ||
    nameFromMeta ||
    labelFromMeta ||
    "tool";

  const kind =
    (typeof update.kind === "string" && update.kind) ||
    kindFromMeta ||
    undefined;

  const status = normalizeToolStatus(
    typeof update.status === "string" ? update.status : undefined,
  );

  const locations = parseLocations(update.locations);
  const rawInput =
    asRecord(update.rawInput) ||
    asRecord(update.raw_input) ||
    asRecord(xaiTool?.input);

  let detail: string | undefined;
  if (locations?.[0]?.path) {
    detail = truncate(locations[0].path, DETAIL_MAX);
  } else if (rawInput) {
    const cmd =
      (typeof rawInput.command === "string" && rawInput.command) ||
      (typeof rawInput.description === "string" && rawInput.description) ||
      (typeof rawInput.target_file === "string" && rawInput.target_file) ||
      (typeof rawInput.path === "string" && rawInput.path) ||
      (typeof rawInput.pattern === "string" && `/${rawInput.pattern}/`) ||
      null;
    if (cmd) detail = truncate(cmd, DETAIL_MAX);
  }

  const name = nameFromMeta || guessName(titleRaw);
  const category = classifyToolCategory(name, titleRaw);

  return {
    id,
    title: titleRaw,
    name,
    kind,
    status: status === "pending" && !update.status ? "in_progress" : status,
    detail,
    category,
    locations,
  };
}

function guessName(title: string): string | undefined {
  const t = title.trim();
  if (!t) return undefined;
  // "read_file" or "Read `/path`" → first token-ish
  if (/^[a-z][a-z0-9_]*$/i.test(t)) return t;
  const m = t.match(/^([a-z][a-z0-9_]*)\b/i);
  return m?.[1];
}

export function classifyToolCategory(
  name?: string,
  title?: string,
): ToolCallItem["category"] {
  const s = `${name || ""} ${title || ""}`.toLowerCase();
  if (s.includes("spawn_subagent") || s.includes("subagent")) return "subagent";
  if (s.includes("background") || s.includes("monitor")) return "background";
  return "tool";
}

function parseLocations(raw: unknown): { path: string }[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: { path: string }[] = [];
  for (const item of raw) {
    const o = asRecord(item);
    if (!o) continue;
    const path =
      (typeof o.path === "string" && o.path) ||
      (typeof o.uri === "string" && o.uri) ||
      "";
    if (path) out.push({ path });
  }
  return out.length ? out : undefined;
}

/** Prefer longer human titles; don't regress to bare tool names. */
export function preferTitle(prev: string | undefined, next: string): string {
  if (!prev) return next;
  if (!next) return prev;
  if (next.length >= prev.length) return next;
  // Don't replace "Read /foo/bar" with "read_file"
  if (/^[a-z][a-z0-9_]*$/i.test(next) && prev.includes(" ")) return prev;
  return next;
}

export function upsertToolCall(
  tools: ToolCallItem[],
  update: Record<string, unknown>,
  now = Date.now(),
): ToolCallItem[] {
  const meta = extractToolMeta(update);
  if (!meta.id) return tools;

  const prev = tools.find((t) => t.id === meta.id);
  const status = meta.status || prev?.status || "in_progress";
  const terminal = isToolDone(status);
  const title = preferTitle(prev?.title, meta.title);

  const next: ToolCallItem = {
    id: meta.id,
    title,
    name: meta.name || prev?.name,
    kind: meta.kind || prev?.kind,
    status,
    startedAt: prev?.startedAt ?? now,
    endedAt: terminal ? (prev?.endedAt ?? now) : prev?.endedAt,
    detail: meta.detail || prev?.detail,
    category: meta.category || prev?.category || "tool",
    locations: meta.locations || prev?.locations,
    // Keep last payload but don't accumulate huge content
    raw: slimRaw(update),
  };

  const rest = tools.filter((t) => t.id !== meta.id);
  const list = [...rest, next];
  return list.length > MAX_TOOLS ? list.slice(-MAX_TOOLS) : list;
}

function slimRaw(update: Record<string, unknown>): unknown {
  // Drop bulky content arrays from stored raw
  const { content: _c, ...rest } = update;
  if (rest.rawInput && typeof rest.rawInput === "object") {
    const ri = { ...(rest.rawInput as object) } as Record<string, unknown>;
    if (typeof ri.prompt === "string" && ri.prompt.length > 200) {
      ri.prompt = truncate(ri.prompt, 200);
    }
    if (typeof ri.command === "string" && ri.command.length > 200) {
      ri.command = truncate(ri.command, 200);
    }
    rest.rawInput = ri;
  }
  return rest;
}

export function upsertBackgroundTask(
  tasks: BackgroundTaskItem[],
  patch: Partial<BackgroundTaskItem> & { taskId: string },
): BackgroundTaskItem[] {
  const prev = tasks.find((t) => t.taskId === patch.taskId);
  const next: BackgroundTaskItem = {
    taskId: patch.taskId,
    toolCallId: patch.toolCallId ?? prev?.toolCallId,
    description: patch.description ?? prev?.description,
    command: patch.command
      ? truncate(patch.command, DETAIL_MAX)
      : prev?.command,
    cwd: patch.cwd ?? prev?.cwd,
    outputFile: patch.outputFile ?? prev?.outputFile,
    status: patch.status ?? prev?.status ?? "running",
    startedAt: patch.startedAt ?? prev?.startedAt ?? Date.now(),
    endedAt: patch.endedAt ?? prev?.endedAt,
    summary: patch.summary
      ? truncate(patch.summary, SUMMARY_MAX)
      : prev?.summary,
  };
  const rest = tasks.filter((t) => t.taskId !== patch.taskId);
  const list = [...rest, next];
  return list.length > MAX_BACKGROUND_TASKS
    ? list.slice(-MAX_BACKGROUND_TASKS)
    : list;
}

export function parseTaskBackgrounded(
  update: Record<string, unknown>,
  now = Date.now(),
): BackgroundTaskItem | null {
  const taskId =
    (typeof update.task_id === "string" && update.task_id) ||
    (typeof update.taskId === "string" && update.taskId) ||
    "";
  if (!taskId) return null;
  return {
    taskId,
    toolCallId:
      (typeof update.tool_call_id === "string" && update.tool_call_id) ||
      (typeof update.toolCallId === "string" && update.toolCallId) ||
      undefined,
    command:
      typeof update.command === "string"
        ? truncate(update.command, DETAIL_MAX)
        : undefined,
    cwd: typeof update.cwd === "string" ? update.cwd : undefined,
    description:
      typeof update.description === "string"
        ? truncate(update.description, DETAIL_MAX)
        : undefined,
    outputFile:
      (typeof update.output_file === "string" && update.output_file) ||
      (typeof update.outputFile === "string" && update.outputFile) ||
      undefined,
    status: "running",
    startedAt: now,
  };
}

export function parseTaskCompleted(
  update: Record<string, unknown>,
  now = Date.now(),
): Partial<BackgroundTaskItem> & { taskId: string } | null {
  const snap =
    asRecord(update.task_snapshot) ||
    asRecord(update.taskSnapshot) ||
    asRecord(update);
  if (!snap) return null;
  const taskId =
    (typeof snap.task_id === "string" && snap.task_id) ||
    (typeof snap.taskId === "string" && snap.taskId) ||
    "";
  if (!taskId) return null;

  let endedAt = now;
  const end = asRecord(snap.end_time) || asRecord(snap.endTime);
  if (end && typeof end.secs_since_epoch === "number") {
    endedAt = end.secs_since_epoch * 1000;
  }

  let startedAt: number | undefined;
  const start = asRecord(snap.start_time) || asRecord(snap.startTime);
  if (start && typeof start.secs_since_epoch === "number") {
    startedAt = start.secs_since_epoch * 1000;
  }

  const output = typeof snap.output === "string" ? snap.output : "";
  const failed =
    typeof snap.exit_code === "number"
      ? snap.exit_code !== 0
      : typeof snap.exitCode === "number"
        ? snap.exitCode !== 0
        : false;

  return {
    taskId,
    command:
      typeof snap.command === "string"
        ? truncate(snap.command, DETAIL_MAX)
        : undefined,
    cwd: typeof snap.cwd === "string" ? snap.cwd : undefined,
    status: failed ? "failed" : "completed",
    startedAt,
    endedAt,
    summary: output ? truncate(output, SUMMARY_MAX) : undefined,
  };
}

export function countRunningTools(tools: ToolCallItem[]): number {
  return tools.filter((t) => isToolRunning(t.status)).length;
}

export function countRunningBackground(tasks: BackgroundTaskItem[]): number {
  return tasks.filter((t) => t.status === "running").length;
}

export function kindAccentClass(kind?: string, category?: string): string {
  if (category === "subagent") return "text-[var(--thought)]";
  if (category === "background") return "text-[var(--warning)]";
  const k = (kind || "").toLowerCase();
  if (k.includes("exec") || k.includes("shell") || k.includes("terminal"))
    return "text-[var(--warning)]";
  if (k.includes("edit") || k.includes("write") || k.includes("delete"))
    return "text-[var(--accent)]";
  if (k.includes("search") || k.includes("read") || k.includes("fetch"))
    return "text-[var(--tool)]";
  return "text-[var(--tool)]";
}
