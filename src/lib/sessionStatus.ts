/**
 * Shared session status for tab strip, navigator rows, and palette details.
 * Keep presentation logic out of App.tsx.
 */

import type { DeskSession } from "../types";
import {
  countRunningBackground,
  countRunningSubagents,
  countRunningTools,
} from "../activity";

export type SessionStatusKind =
  | "permission"
  | "plan-approval"
  | "busy"
  | "watching"
  | "ready";

export type SessionStatus = {
  kind: SessionStatusKind;
  /** Short label for aria / tooltips */
  label: string;
  /** Tailwind-ish color class for the status dot */
  dotClass: string;
  /** True when the session needs user attention */
  alert: boolean;
};

export function sessionStatus(s: DeskSession): SessionStatus {
  if (s.permissions.length > 0) {
    return {
      kind: "permission",
      label: "Needs permission",
      dotClass: "bg-[var(--danger)]",
      alert: true,
    };
  }
  if (s.planApproval) {
    return {
      kind: "plan-approval",
      label: "Plan waiting for approval",
      dotClass: "bg-[var(--warning)]",
      alert: true,
    };
  }
  if (s.busy) {
    return {
      kind: "busy",
      label: "Running",
      dotClass: "bg-[var(--warning)] animate-pulse",
      alert: false,
    };
  }
  const tools = countRunningTools(s.tools);
  const subs = countRunningSubagents(s.subagents ?? []);
  const bg = countRunningBackground(s.backgroundTasks ?? []);
  if (tools > 0 || subs > 0 || bg > 0) {
    const parts: string[] = [];
    if (subs > 0) parts.push(`${subs} subagent${subs === 1 ? "" : "s"}`);
    if (bg > 0) parts.push(`${bg} bg`);
    if (tools > 0) parts.push(`${tools} tool${tools === 1 ? "" : "s"}`);
    return {
      kind: "watching",
      label: `Watching · ${parts.join(" · ")}`,
      dotClass: "bg-[var(--tool)] animate-pulse",
      alert: false,
    };
  }
  return {
    kind: "ready",
    label: "Ready",
    dotClass: "bg-[var(--success)]",
    alert: false,
  };
}
