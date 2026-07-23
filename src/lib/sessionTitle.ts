/**
 * Single display-name policy for sessions across tabs, chrome, pins, and recents.
 *
 * Priority for a given sessionId:
 *   1. User rename (`session-titles.json`, applied into DeskSession.title)
 *   2. Best non-generic candidate (pin bookmark, Grok summary, resume hint)
 *   3. Project folder name
 */

import { folderName } from "./format";

/** True when title is empty or just the project folder / full cwd. */
export function isGenericTitle(
  title: string | null | undefined,
  cwd: string,
): boolean {
  if (!title || !title.trim()) return true;
  const t = title.trim();
  const folder = folderName(cwd);
  return t === folder || t === cwd;
}

/** First non-empty trimmed string, or empty. */
export function firstTitle(
  ...candidates: (string | null | undefined)[]
): string {
  for (const c of candidates) {
    if (c && c.trim()) return c.trim();
  }
  return "";
}

/**
 * Resolve the display title for a session.
 * Prefers the first non-generic candidate; falls back to first non-empty, then folder.
 */
export function resolveSessionTitle(
  cwd: string,
  ...candidates: (string | null | undefined)[]
): string {
  const nonEmpty = candidates
    .map((c) => (c && c.trim() ? c.trim() : ""))
    .filter(Boolean);
  if (nonEmpty.length === 0) return folderName(cwd) || "Untitled";
  const nonGeneric = nonEmpty.find((t) => !isGenericTitle(t, cwd));
  return nonGeneric || nonEmpty[0];
}

/**
 * Whether `incoming` should replace `current` for the same session/cwd.
 * Never downgrades a custom name to a generic folder name.
 */
export function shouldAdoptTitle(
  cwd: string,
  current: string | null | undefined,
  incoming: string | null | undefined,
): boolean {
  if (!incoming || !incoming.trim()) return false;
  const next = incoming.trim();
  if (!current || !current.trim()) return true;
  if (current.trim() === next) return false;
  // Upgrade generic → descriptive
  if (isGenericTitle(current, cwd) && !isGenericTitle(next, cwd)) return true;
  // Same genericity: allow explicit rename (caller already decided)
  return false;
}
