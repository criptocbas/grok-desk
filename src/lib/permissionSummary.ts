/**
 * Human-readable permission summaries from ACP toolCall payloads.
 * Progressive disclosure: summary first, raw JSON only on demand.
 */

export type PermissionRisk = "low" | "medium" | "high";

export type PermissionSummary = {
  /** Short headline, e.g. "Run shell command" */
  title: string;
  /** Tool name if known (read_file, run_terminal_command, …) */
  toolName?: string;
  /** ACP kind: read | search | execute | edit | … */
  kind?: string;
  /** Path, command snippet, or other one-line context */
  detail?: string;
  risk: PermissionRisk;
  riskLabel: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function truncate(s: string, max = 160): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function pickPath(input: Record<string, unknown> | null): string | undefined {
  if (!input) return undefined;
  return (
    str(input.target_file) ||
    str(input.path) ||
    str(input.file_path) ||
    str(input.file) ||
    str(input.uri) ||
    str(input.cwd)
  );
}

function pickCommand(input: Record<string, unknown> | null): string | undefined {
  if (!input) return undefined;
  return str(input.command) || str(input.cmd) || str(input.shell);
}

function pickPattern(input: Record<string, unknown> | null): string | undefined {
  if (!input) return undefined;
  const p = str(input.pattern) || str(input.query) || str(input.glob);
  return p ? `/${p}/` : undefined;
}

function locationsPath(tool: Record<string, unknown>): string | undefined {
  const locs = tool.locations;
  if (!Array.isArray(locs) || locs.length === 0) return undefined;
  for (const item of locs) {
    const o = asRecord(item);
    if (!o) continue;
    const p = str(o.path) || str(o.uri);
    if (p) return p;
  }
  return undefined;
}

function metaToolName(tool: Record<string, unknown>): string | undefined {
  const meta = asRecord(tool._meta) || asRecord(tool.meta);
  if (!meta) return undefined;
  const xai = asRecord(meta["x.ai/tool"]) || asRecord(meta["xai/tool"]);
  return (
    str(meta["x.ai/tool.name"]) ||
    str(meta.toolName) ||
    str(xai?.name) ||
    str(meta.name)
  );
}

function guessNameFromTitle(title: string): string | undefined {
  const t = title.trim();
  if (!t) return undefined;
  if (/^[a-z][a-z0-9_]*$/i.test(t)) return t;
  const m = t.match(/^([a-z][a-z0-9_]*)\b/i);
  return m?.[1];
}

function riskFor(
  kind: string | undefined,
  name: string | undefined,
  title: string,
  detail: string | undefined,
): PermissionRisk {
  const s = `${kind || ""} ${name || ""} ${title} ${detail || ""}`.toLowerCase();

  // Destructive / high-impact
  if (
    s.includes("delete") ||
    s.includes("rm ") ||
    s.includes("rmdir") ||
    s.includes("drop ") ||
    s.includes("force") ||
    s.includes("sudo") ||
    s.includes("chmod") ||
    s.includes("chown") ||
    s.includes("kill") ||
    s.includes("format") ||
    s.includes("git push") ||
    s.includes("git reset") ||
    s.includes("git clean")
  ) {
    return "high";
  }

  // Execute / write / network-ish
  if (
    s.includes("execute") ||
    s.includes("terminal") ||
    s.includes("shell") ||
    s.includes("bash") ||
    s.includes("run_") ||
    s.includes("write") ||
    s.includes("edit") ||
    s.includes("search_replace") ||
    s.includes("apply_patch") ||
    s.includes("create_file") ||
    s.includes("str_replace") ||
    s.includes("spawn")
  ) {
    return "medium";
  }

  // Read / search
  if (
    s.includes("read") ||
    s.includes("search") ||
    s.includes("grep") ||
    s.includes("list") ||
    s.includes("glob") ||
    s.includes("fetch") ||
    s.includes("open_page")
  ) {
    return "low";
  }

  // Default: unknown tool needs attention
  return "medium";
}

function riskLabel(risk: PermissionRisk): string {
  switch (risk) {
    case "low":
      return "Read / inspect";
    case "high":
      return "High impact";
    default:
      return "May change system";
  }
}

function humanTitle(
  kind: string | undefined,
  name: string | undefined,
  title: string,
): string {
  const n = (name || "").toLowerCase();
  const k = (kind || "").toLowerCase();
  const t = title.trim();

  if (n.includes("run_terminal") || n.includes("bash") || k === "execute") {
    return "Run shell command";
  }
  if (n.includes("write") || n.includes("create_file")) return "Write file";
  if (n.includes("search_replace") || n.includes("str_replace") || n.includes("edit")) {
    return "Edit file";
  }
  if (n.includes("delete") || n.includes("remove")) return "Delete path";
  if (n.includes("read_file") || n.includes("read") || k === "read") {
    return "Read file";
  }
  if (n.includes("grep") || n.includes("search") || k === "search") {
    return "Search codebase";
  }
  if (n.includes("spawn_subagent") || n.includes("subagent")) {
    return "Spawn subagent";
  }
  if (n.includes("web_search") || n.includes("open_page")) {
    return "Network / web access";
  }
  if (t && !/^[a-z][a-z0-9_]*$/i.test(t)) return truncate(t, 80);
  if (name) return name.replace(/_/g, " ");
  if (kind) return `Tool · ${kind}`;
  return "Tool permission";
}

/**
 * Build a structured summary from ACP permission toolCall / raw payload.
 */
export function summarizePermissionToolCall(
  toolCall: unknown,
  raw?: unknown,
): PermissionSummary {
  const tool =
    asRecord(toolCall) ||
    asRecord(raw) ||
    asRecord(asRecord(raw)?.toolCall) ||
    {};

  const titleRaw =
    str(tool.title) ||
    str(tool.name) ||
    str(tool.toolName) ||
    "";

  const kind =
    str(tool.kind) ||
    str(tool.toolKind) ||
    str(asRecord(tool._meta)?.kind);

  const name =
    metaToolName(tool) ||
    str(tool.name) ||
    guessNameFromTitle(titleRaw);

  const meta = asRecord(tool._meta) || asRecord(tool.meta);
  const xaiTool = meta
    ? asRecord(meta["x.ai/tool"]) || asRecord(meta["xai/tool"])
    : null;
  const input =
    asRecord(tool.rawInput) ||
    asRecord(tool.raw_input) ||
    asRecord(tool.input) ||
    asRecord(xaiTool?.input) ||
    asRecord(meta?.input);

  const detail =
    locationsPath(tool) ||
    pickPath(input) ||
    pickCommand(input) ||
    pickPattern(input) ||
    str(input?.description) ||
    str(tool.description) ||
    undefined;

  const title = humanTitle(kind, name, titleRaw);
  const risk = riskFor(kind, name, titleRaw || title, detail);

  return {
    title,
    toolName: name,
    kind: kind || undefined,
    detail: detail ? truncate(detail, 200) : undefined,
    risk,
    riskLabel: riskLabel(risk),
  };
}

/** Style option buttons from ACP option kind. */
export function permissionOptionStyle(
  kind: string,
  name: string,
): "allow" | "allow-always" | "deny" | "neutral" {
  const k = `${kind} ${name}`.toLowerCase();
  if (k.includes("reject") || k.includes("deny") || k.includes("cancel")) {
    return "deny";
  }
  if (k.includes("allow_always") || k.includes("always")) {
    return "allow-always";
  }
  if (k.includes("allow") || k.includes("approve") || k.includes("yes")) {
    return "allow";
  }
  return "neutral";
}
