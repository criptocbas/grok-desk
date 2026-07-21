/**
 * Single source of truth for keyboard shortcuts.
 * Command palette, ShortcutsHelp, and the global key handler all derive from this.
 */

export type ShortcutId =
  | "command-palette"
  | "shortcuts-help"
  | "toggle-plan"
  | "toggle-diff"
  | "toggle-activity"
  | "toggle-settings"
  | "toggle-sidebar"
  | "new-session"
  | "focus-composer"
  | "next-session"
  | "prev-session"
  | "escape-layer";

export type ShortcutDef = {
  id: ShortcutId;
  /** Human-readable keys for help UI */
  keys: string;
  /** Short action description */
  label: string;
  /** Category for help grouping */
  group: "palette" | "panels" | "sessions" | "composer" | "general";
};

/** Static registry — keep in sync with App key handler. */
export const SHORTCUTS: ShortcutDef[] = [
  {
    id: "command-palette",
    keys: "Ctrl+K",
    label: "Command palette",
    group: "palette",
  },
  {
    id: "shortcuts-help",
    keys: "Ctrl+/",
    label: "Keyboard shortcuts",
    group: "general",
  },
  {
    id: "toggle-plan",
    keys: "Alt+P",
    label: "Toggle Plan panel",
    group: "panels",
  },
  {
    id: "toggle-diff",
    keys: "Alt+D",
    label: "Toggle Diff panel",
    group: "panels",
  },
  {
    id: "toggle-activity",
    keys: "Alt+A",
    label: "Toggle Activity panel",
    group: "panels",
  },
  {
    id: "toggle-settings",
    keys: "Alt+,",
    label: "Toggle Settings panel",
    group: "panels",
  },
  {
    id: "toggle-sidebar",
    keys: "Ctrl+B / Alt+B",
    label: "Collapse / expand sidebar",
    group: "panels",
  },
  {
    id: "new-session",
    keys: "Ctrl+N",
    label: "New session",
    group: "sessions",
  },
  {
    id: "next-session",
    keys: "Ctrl+Tab",
    label: "Next open session",
    group: "sessions",
  },
  {
    id: "prev-session",
    keys: "Ctrl+Shift+Tab",
    label: "Previous open session",
    group: "sessions",
  },
  {
    id: "focus-composer",
    keys: "Ctrl+L",
    label: "Focus composer",
    group: "composer",
  },
  {
    id: "escape-layer",
    keys: "Esc",
    label: "Close palette / help / panel",
    group: "general",
  },
];

/** Rows for ShortcutsHelp (includes non-key gestures). */
export const SHORTCUT_HELP_EXTRA: [string, string][] = [
  ["/", "Slash commands & skills palette"],
  ["↑ ↓ Tab", "Navigate / complete slash command"],
  ["Enter", "Send, queue if busy, or complete slash"],
  ["Shift+Enter", "New line in composer"],
  ["Scroll up", "Pause auto-follow; Jump to latest to resume"],
  ["📌 Pin", "Keep session across restarts · drag to reorder"],
];

export function shortcutHelpRows(): [string, string][] {
  const fromRegistry = SHORTCUTS.map((s) => [s.keys, s.label] as [string, string]);
  return [...fromRegistry, ...SHORTCUT_HELP_EXTRA];
}
