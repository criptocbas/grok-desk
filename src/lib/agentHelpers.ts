import type { PermissionOption } from "../types";
import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_EFFORTS = [
  { id: "high", value: "high", label: "High" },
  { id: "medium", value: "medium", label: "Medium" },
  { id: "low", value: "low", label: "Low" },
] as const;

export function pickAllowOption(options: PermissionOption[]): string | null {
  if (!options.length) return null;
  const always = options.find((o) =>
    (o.kind || "").toLowerCase().includes("allow_always"),
  );
  if (always) return always.optionId;
  const once = options.find((o) =>
    (o.kind || "").toLowerCase().includes("allow"),
  );
  if (once) return once.optionId;
  const byName = options.find((o) =>
    /allow|approve|yes/i.test(o.name || o.optionId),
  );
  if (byName) return byName.optionId;
  return options[0]?.optionId ?? null;
}

export function notifyOs(title: string, body: string) {
  void invoke("show_notification", { title, body }).catch(() => {
    /* optional — notify-send may be missing */
  });
}

/** Tools that usually change the working tree — trigger auto Diff refresh. */
export function isMutatingTool(title: string, kind?: string): boolean {
  const t = `${title} ${kind ?? ""}`.toLowerCase();
  return (
    t.includes("write") ||
    t.includes("search_replace") ||
    t.includes("edit") ||
    t.includes("delete") ||
    t.includes("run_terminal") ||
    t.includes("bash") ||
    t.includes("shell") ||
    t.includes("str_replace") ||
    t.includes("create_file") ||
    t.includes("apply_patch")
  );
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export type PendingImage = {
  id: string;
  mimeType: string;
  data: string;
  name: string;
  previewUrl: string;
};
