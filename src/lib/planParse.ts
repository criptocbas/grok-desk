import type { AvailableCommand, PlanEntry } from "../types";

export function parseAvailableCommands(raw: unknown[]): AvailableCommand[] {
  const out: AvailableCommand[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name =
      (typeof o.name === "string" && o.name) ||
      (typeof o.command === "string" && o.command) ||
      "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const description =
      (typeof o.description === "string" && o.description) ||
      (typeof o.desc === "string" && o.desc) ||
      null;
    let inputHint: string | null = null;
    const input = o.input;
    if (input && typeof input === "object") {
      const hint = (input as Record<string, unknown>).hint;
      if (typeof hint === "string") inputHint = hint;
    } else if (typeof o.hint === "string") {
      inputHint = o.hint;
    }
    out.push({ name, description, inputHint });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function parsePlanEntries(raw: unknown): PlanEntry[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: PlanEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const content =
      (typeof o.content === "string" && o.content) ||
      (typeof o.text === "string" && o.text) ||
      "";
    if (!content) continue;
    out.push({
      content,
      priority: (typeof o.priority === "string" && o.priority) || "medium",
      status: (typeof o.status === "string" && o.status) || "pending",
    });
  }
  return out.length ? out : null;
}

/** Extract plan steps from todo_write tool payloads. */
export function planFromTodoInput(raw: unknown): PlanEntry[] | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const todos = o.todos;
  if (!Array.isArray(todos)) return null;
  const out: PlanEntry[] = [];
  for (const t of todos) {
    if (!t || typeof t !== "object") continue;
    const item = t as Record<string, unknown>;
    const content = typeof item.content === "string" ? item.content : "";
    if (!content) continue;
    out.push({
      content,
      priority: "medium",
      status: (typeof item.status === "string" && item.status) || "pending",
    });
  }
  return out.length ? out : null;
}
