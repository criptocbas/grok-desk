import type {
  BackgroundTaskItem,
  SubagentItem,
  SubagentStatus,
  ToolCallItem,
} from "./types";

export const MAX_TOOLS = 100;
export const MAX_BACKGROUND_TASKS = 40;
export const MAX_SUBAGENTS = 40;
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

  // Sticky subagent category — later updates retitle to description ("Linux POV")
  // and would otherwise reclassify as a plain tool.
  const mergedName = meta.name || prev?.name;
  const mergedTitle = title;
  const forceSub =
    prev?.category === "subagent" ||
    meta.category === "subagent" ||
    isSpawnSubagentTool(mergedName, mergedTitle, update);
  const category: ToolCallItem["category"] = forceSub
    ? "subagent"
    : meta.category || prev?.category || "tool";

  const next: ToolCallItem = {
    id: meta.id,
    title,
    name: mergedName,
    kind: meta.kind || prev?.kind,
    status,
    startedAt: prev?.startedAt ?? now,
    endedAt: terminal ? (prev?.endedAt ?? now) : prev?.endedAt,
    detail: meta.detail || prev?.detail,
    category,
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

/** True if a label is useless as a human row title. */
export function isWeakSubagentLabel(s: string | undefined | null): boolean {
  if (s == null) return true;
  const t = s.trim();
  if (!t) return true;
  if (/^spawn_subagent$/i.test(t)) return true;
  if (/^subagent$/i.test(t)) return true;
  if (/^task$/i.test(t)) return true;
  if (/^tool$/i.test(t)) return true;
  if (/^other$/i.test(t)) return true;
  return false;
}

/**
 * Best human title for a subagent row / card.
 * Prefer description → type chip label → short id — never a bare "Subagent" if we can avoid it.
 */
export function subagentDisplayTitle(
  sub: Pick<SubagentItem, "description" | "subagentType" | "subagentId">,
): string {
  if (!isWeakSubagentLabel(sub.description)) return sub.description.trim();
  if (sub.subagentType && !isWeakSubagentLabel(sub.subagentType)) {
    return sub.subagentType;
  }
  if (sub.subagentId && !sub.subagentId.startsWith("pending:")) {
    return `Subagent ${sub.subagentId.slice(0, 8)}`;
  }
  return "Subagent";
}

/**
 * Pull a human description from a spawn tool_call / subagent_* update.
 * Grok often renames the tool title to this string (e.g. "Linux POV").
 */
export function extractSpawnDescription(
  update: Record<string, unknown>,
): string | undefined {
  const ri =
    asRecord(update.rawInput) ||
    asRecord(update.raw_input) ||
    {};
  const metaRoot = asRecord(update._meta);
  const xaiTool = asRecord(metaRoot?.["x.ai/tool"]);
  const xaiInput = asRecord(xaiTool?.input) || {};

  const contentText = extractToolContentText(update);
  const fromContent =
    contentText.match(/^\s*description\s*:\s*(.+)$/im)?.[1]?.trim() ||
    contentText.match(/\ndescription\s*:\s*(.+)/i)?.[1]?.trim();

  const candidates: unknown[] = [
    ri.description,
    xaiInput.description,
    update.description,
    // Title after Grok renames spawn_subagent → "Linux POV"
    update.title,
    fromContent,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && !isWeakSubagentLabel(c)) {
      return truncate(c.trim(), DETAIL_MAX);
    }
  }
  return undefined;
}

export function normalizeSubagentStatus(
  status: string | undefined | null,
): SubagentStatus {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "success" || s === "done") return "completed";
  if (s === "failed" || s === "error") return "failed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "running" || s === "in_progress" || s === "pending") return "running";
  if (!s) return "running";
  return "unknown";
}

export function isSubagentRunning(status: SubagentStatus | string): boolean {
  return normalizeSubagentStatus(status) === "running";
}

export function isSubagentDone(status: SubagentStatus | string): boolean {
  const s = normalizeSubagentStatus(status);
  return s === "completed" || s === "failed" || s === "cancelled";
}

export function countRunningSubagents(list: SubagentItem[]): number {
  return list.filter((s) => isSubagentRunning(s.status)).length;
}

export function upsertSubagent(
  list: SubagentItem[],
  patch: Partial<SubagentItem> & { subagentId: string },
): SubagentItem[] {
  const prev = list.find((s) => s.subagentId === patch.subagentId);
  // Never let later spawn-tool updates clobber a terminal finish back to "running".
  const prevDone = prev ? isSubagentDone(prev.status) : false;
  const patchStatus = patch.status;
  let status: SubagentStatus =
    patchStatus ?? prev?.status ?? "running";
  if (prevDone && patchStatus === "running") {
    status = prev!.status;
  }
  // Prefer a strong human label; never let a weak patch erase a good prev title.
  const patchDesc = patch.description?.trim();
  const description = truncate(
    (!isWeakSubagentLabel(patchDesc) ? patchDesc : undefined) ||
      (!isWeakSubagentLabel(prev?.description) ? prev?.description : undefined) ||
      patchDesc ||
      prev?.description ||
      "Subagent",
    DETAIL_MAX,
  );
  const next: SubagentItem = {
    subagentId: patch.subagentId,
    childSessionId: patch.childSessionId ?? prev?.childSessionId,
    parentSessionId: patch.parentSessionId ?? prev?.parentSessionId,
    toolCallId: patch.toolCallId ?? prev?.toolCallId,
    description,
    subagentType: patch.subagentType ?? prev?.subagentType,
    model: patch.model ?? prev?.model,
    status,
    contextSource: patch.contextSource ?? prev?.contextSource,
    resumedFrom: patch.resumedFrom ?? prev?.resumedFrom,
    startedAt: patch.startedAt ?? prev?.startedAt ?? Date.now(),
    endedAt:
      prevDone && patchStatus === "running"
        ? prev?.endedAt
        : (patch.endedAt ?? prev?.endedAt),
    durationMs:
      prevDone && patchStatus === "running"
        ? prev?.durationMs
        : (patch.durationMs ?? prev?.durationMs),
    toolCalls: patch.toolCalls ?? prev?.toolCalls,
    turns: patch.turns ?? prev?.turns,
    tokensUsed: patch.tokensUsed ?? prev?.tokensUsed,
    outputSummary: patch.outputSummary
      ? truncate(patch.outputSummary, SUMMARY_MAX)
      : prev?.outputSummary,
  };
  const rest = list.filter((s) => s.subagentId !== patch.subagentId);
  const out = [...rest, next];
  return out.length > MAX_SUBAGENTS ? out.slice(-MAX_SUBAGENTS) : out;
}

export function parseSubagentSpawned(
  update: Record<string, unknown>,
  now = Date.now(),
): SubagentItem | null {
  const subagentId =
    (typeof update.subagent_id === "string" && update.subagent_id) ||
    (typeof update.subagentId === "string" && update.subagentId) ||
    "";
  if (!subagentId) return null;

  const description =
    extractSpawnDescription(update) ||
    (typeof update.description === "string" &&
    !isWeakSubagentLabel(update.description)
      ? update.description.trim()
      : undefined) ||
    "Subagent";

  return {
    subagentId,
    childSessionId:
      (typeof update.child_session_id === "string" &&
        update.child_session_id) ||
      (typeof update.childSessionId === "string" && update.childSessionId) ||
      subagentId,
    parentSessionId:
      (typeof update.parent_session_id === "string" &&
        update.parent_session_id) ||
      (typeof update.parentSessionId === "string" && update.parentSessionId) ||
      undefined,
    description: truncate(description, DETAIL_MAX),
    subagentType:
      (typeof update.subagent_type === "string" && update.subagent_type) ||
      (typeof update.subagentType === "string" && update.subagentType) ||
      undefined,
    model:
      (typeof update.model === "string" && update.model) ||
      (typeof update.effective_model_id === "string" &&
        update.effective_model_id) ||
      undefined,
    status: "running",
    contextSource:
      (typeof update.effective_context_source === "string" &&
        update.effective_context_source) ||
      (typeof update.effectiveContextSource === "string" &&
        update.effectiveContextSource) ||
      undefined,
    resumedFrom:
      (typeof update.resumed_from === "string" && update.resumed_from) ||
      (typeof update.resumedFrom === "string" && update.resumedFrom) ||
      undefined,
    startedAt: now,
  };
}

export function parseSubagentFinished(
  update: Record<string, unknown>,
  now = Date.now(),
): (Partial<SubagentItem> & { subagentId: string }) | null {
  const subagentId =
    (typeof update.subagent_id === "string" && update.subagent_id) ||
    (typeof update.subagentId === "string" && update.subagentId) ||
    "";
  if (!subagentId) return null;

  const status = normalizeSubagentStatus(
    typeof update.status === "string" ? update.status : "completed",
  );

  let durationMs: number | undefined;
  if (typeof update.duration_ms === "number") durationMs = update.duration_ms;
  else if (typeof update.durationMs === "number") durationMs = update.durationMs;

  const endedAt =
    durationMs != null && durationMs >= 0 ? now : now;

  const output =
    (typeof update.output === "string" && update.output) ||
    (typeof update.summary === "string" && update.summary) ||
    "";

  return {
    subagentId,
    childSessionId:
      (typeof update.child_session_id === "string" &&
        update.child_session_id) ||
      (typeof update.childSessionId === "string" && update.childSessionId) ||
      undefined,
    status: status === "running" ? "completed" : status,
    endedAt,
    durationMs,
    toolCalls:
      typeof update.tool_calls === "number"
        ? update.tool_calls
        : typeof update.toolCalls === "number"
          ? update.toolCalls
          : undefined,
    turns:
      typeof update.turns === "number" ? update.turns : undefined,
    tokensUsed:
      typeof update.tokens_used === "number"
        ? update.tokens_used
        : typeof update.tokensUsed === "number"
          ? update.tokensUsed
          : undefined,
    outputSummary: output ? truncate(output, SUMMARY_MAX) : undefined,
  };
}

/** True if this tool call is a spawn_subagent (skip chat spam when lifecycle card exists). */
export function isSpawnSubagentTool(
  name?: string,
  title?: string,
  raw?: unknown,
): boolean {
  const s = `${name || ""} ${title || ""}`.toLowerCase();
  if (s.includes("spawn_subagent") || s.includes("task tool")) return true;
  // Grok often renames the title to the description ("Linux POV") while kind stays Other.
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const meta = o?._meta && typeof o._meta === "object" ? (o._meta as Record<string, unknown>) : null;
  const xai = meta?.["x.ai/tool"] && typeof meta["x.ai/tool"] === "object"
    ? (meta["x.ai/tool"] as Record<string, unknown>)
    : null;
  if (typeof xai?.name === "string" && xai.name.toLowerCase().includes("spawn_subagent")) {
    return true;
  }
  const label = typeof xai?.label === "string" ? xai.label.toLowerCase() : "";
  if (label === "subagent" || label.includes("subagent")) return true;
  const ri =
    (o?.rawInput && typeof o.rawInput === "object"
      ? (o.rawInput as Record<string, unknown>)
      : null) ||
    (o?.raw_input && typeof o.raw_input === "object"
      ? (o.raw_input as Record<string, unknown>)
      : null);
  if (
    ri &&
    (ri.variant === "Task" ||
      ri.subagent_type ||
      ri.subagentType ||
      (typeof ri.prompt === "string" &&
        typeof ri.description === "string" &&
        (ri.background === true || ri.subagent_type || ri.subagentType)))
  ) {
    // Heuristic: spawn_subagent rawInput always has description + prompt
    if (typeof ri.description === "string" && typeof ri.prompt === "string") {
      return true;
    }
    if (ri.variant === "Task" || ri.subagent_type || ri.subagentType) return true;
  }
  // Tool result text from background spawn
  const contentText = extractToolContentText(o);
  if (contentText && /subagent_id\s*:/i.test(contentText)) return true;
  return false;
}

/** Pull plain text from ACP tool content blocks. */
export function extractToolContentText(
  update: Record<string, unknown> | null,
): string {
  if (!update) return "";
  const content = update.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    const rawOut = asRecord(update.rawOutput) || asRecord(update.raw_output);
    if (rawOut && typeof rawOut.text === "string") return rawOut.text;
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    const b = asRecord(block);
    if (!b) continue;
    if (typeof b.text === "string") parts.push(b.text);
    const inner = asRecord(b.content);
    if (inner && typeof inner.text === "string") parts.push(inner.text);
  }
  return parts.join("\n");
}

/**
 * Build / refresh a SubagentItem from a spawn_subagent tool_call(_update).
 * Works even when `_x.ai/session/update` subagent_* events never reach the UI.
 */
export function subagentFromSpawnTool(
  update: Record<string, unknown>,
  now = Date.now(),
): (Partial<SubagentItem> & { subagentId: string }) | null {
  const toolCallId =
    (typeof update.toolCallId === "string" && update.toolCallId) ||
    (typeof update.tool_call_id === "string" && update.tool_call_id) ||
    "";
  const title =
    (typeof update.title === "string" && update.title) || undefined;
  const metaRoot = asRecord(update._meta);
  const xaiTool = asRecord(metaRoot?.["x.ai/tool"]);
  const name =
    (typeof xaiTool?.name === "string" && xaiTool.name) ||
    (typeof update.tool === "string" && update.tool) ||
    title;

  if (!isSpawnSubagentTool(name, title, update) && !toolCallId) return null;
  if (!isSpawnSubagentTool(name, title, update)) {
    // Only treat as spawn when detection agrees
    return null;
  }

  const ri =
    asRecord(update.rawInput) ||
    asRecord(update.raw_input) ||
    asRecord(xaiTool?.input) ||
    {};

  const contentText = extractToolContentText(update);
  const idFromContent =
    contentText.match(/subagent_id\s*:\s*([^\s\n]+)/i)?.[1] ||
    contentText.match(/task_ids?\s*[:=]\s*\[?\s*"([a-f0-9-]+)"/i)?.[1];

  // Grok puts the real child id on tool updates as task_id (see rawInput).
  const idFromInput =
    (typeof ri.task_id === "string" && ri.task_id) ||
    (typeof ri.taskId === "string" && ri.taskId) ||
    (typeof ri.subagent_id === "string" && ri.subagent_id) ||
    (typeof ri.subagentId === "string" && ri.subagentId) ||
    undefined;

  const subagentId =
    idFromContent ||
    idFromInput ||
    (toolCallId ? `pending:${toolCallId}` : "") ||
    "";
  if (!subagentId) return null;

  // Prefer real spawn description ("Linux POV") over generic tool labels.
  const description = extractSpawnDescription(update);

  const subagentType =
    (typeof ri.subagent_type === "string" && ri.subagent_type) ||
    (typeof ri.subagentType === "string" && ri.subagentType) ||
    contentText.match(/type\s*:\s*([^\s\n]+)/i)?.[1] ||
    undefined;

  // Background spawn tool completes quickly while the child keeps running.
  // Do NOT claim completed from the spawn tool alone for background work.
  // Omit status when unknown so upsert keeps a prior terminal status.
  const toolStatus = normalizeToolStatus(
    typeof update.status === "string" ? update.status : undefined,
  );
  const background =
    ri.background === true ||
    ri.run_in_background === true ||
    ri.runInBackground === true ||
    /started in background/i.test(contentText);
  let status: SubagentStatus | undefined = "running";
  if (isToolDone(toolStatus) && !background && (idFromContent || idFromInput)) {
    status = toolStatus === "failed" ? "failed" : "completed";
  } else if (background) {
    // Only assert running on first sight; later tool updates must not
    // force running over an already-completed subagent (upsert guards too).
    status = "running";
  }

  return {
    subagentId,
    toolCallId: toolCallId || undefined,
    childSessionId: idFromContent || idFromInput || undefined,
    // Omit weak labels so upsert keeps a better previous description.
    description: description || undefined,
    subagentType,
    status,
    startedAt: now,
    endedAt: status && status !== "running" ? now : undefined,
  };
}

/**
 * When wait / get_command_or_subagent_output completes, mark matching
 * subagents completed (fallback if subagent_finished never arrives).
 */
export function completeSubagentsFromWaitTool(
  list: SubagentItem[],
  update: Record<string, unknown>,
  now = Date.now(),
): SubagentItem[] {
  const title = String(update.title || "").toLowerCase();
  const name = String(
    (asRecord(asRecord(update._meta)?.["x.ai/tool"])?.name as string) || "",
  ).toLowerCase();
  const content = extractToolContentText(update);
  const looksWait =
    title.includes("wait") ||
    title.includes("get task") ||
    title.includes("multi-wait") ||
    name.includes("get_command_or_subagent") ||
    name.includes("wait_command") ||
    name.includes("wait_commands");
  if (!looksWait) return list;

  const toolStatus = normalizeToolStatus(
    typeof update.status === "string" ? update.status : undefined,
  );
  if (!isToolDone(toolStatus)) return list;

  // Collect task/subagent ids mentioned in the wait result
  const ids = new Set<string>();
  for (const m of content.matchAll(
    /(?:subagent_id|task_id|taskId)\s*[:=]\s*["']?([a-f0-9-]{8,})/gi,
  )) {
    ids.add(m[1]);
  }
  for (const m of content.matchAll(/["']([0-9a-f]{8}-[0-9a-f-]{20,})["']/gi)) {
    ids.add(m[1]);
  }
  const ri = asRecord(update.rawInput) || asRecord(update.raw_input) || {};
  const taskIds = ri.task_ids || ri.taskIds;
  if (Array.isArray(taskIds)) {
    for (const t of taskIds) {
      if (typeof t === "string") ids.add(t);
    }
  }

  // If wait finished and we know ids, complete those; if wait_all and no ids,
  // complete every still-running subagent (parent just blocked on all of them).
  const waitAll =
    title.includes("wait_all") ||
    title.includes("multi-wait") ||
    ri.mode === "wait_all" ||
    /wait_all/i.test(content);

  return list.map((s) => {
    if (!isSubagentRunning(s.status)) return s;
    // For wait_all with extracted ids, only complete matched; if no ids, complete all running
    const shouldComplete =
      ids.size > 0
        ? ids.has(s.subagentId) ||
          (!!s.childSessionId && ids.has(s.childSessionId)) ||
          (!!s.toolCallId && ids.has(s.toolCallId))
        : waitAll;
    if (!shouldComplete) return s;
    return {
      ...s,
      status: toolStatus === "failed" ? "failed" : "completed",
      endedAt: s.endedAt ?? now,
      durationMs:
        s.durationMs ??
        (s.startedAt != null ? Math.max(0, now - s.startedAt) : undefined),
    };
  });
}

/** Prefer real subagent ids over pending:toolCallId placeholders with same description. */
export function reconcileSubagentList(
  list: SubagentItem[],
  incoming: Partial<SubagentItem> & { subagentId: string },
): SubagentItem[] {
  let next = list;
  if (!incoming.subagentId.startsWith("pending:")) {
    // Fold pending rows into the real id (keep startedAt / description)
    const pending = next.filter(
      (s) =>
        s.subagentId.startsWith("pending:") &&
        (s.description === incoming.description ||
          (!!incoming.toolCallId && s.toolCallId === incoming.toolCallId)),
    );
    if (pending.length) {
      const p0 = pending[0];
      next = next.filter((s) => !pending.some((p) => p.subagentId === s.subagentId));
      incoming = {
        ...incoming,
        description: incoming.description || p0.description,
        toolCallId: incoming.toolCallId || p0.toolCallId,
        subagentType: incoming.subagentType || p0.subagentType,
        startedAt: p0.startedAt ?? incoming.startedAt,
        model: incoming.model || p0.model,
      };
    }
  }
  return upsertSubagent(next, incoming);
}

/** Short type label for chips. */
export function subagentTypeChip(type?: string): string {
  const t = (type || "").toLowerCase();
  if (t === "explore") return "explore";
  if (t === "plan") return "plan";
  if (t === "general-purpose" || t === "general") return "gen";
  if (t.length > 0 && t.length <= 8) return t;
  if (t) return t.slice(0, 6);
  return "sub";
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
