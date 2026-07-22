/**
 * Chat transcript + composer column width.
 * Expands when side rails free space; stays tighter when both are open
 * so prose doesn't stretch edge-to-edge on ultrawide.
 */
export function chatContentMaxClass(opts: {
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
}): string {
  const leftOpen = !opts.sidebarCollapsed;
  const rightOpen = opts.inspectorOpen;

  // Both utility surfaces open — keep classic ~48rem column
  if (leftOpen && rightOpen) {
    return "max-w-3xl";
  }
  // One rail open — medium column
  if (leftOpen || rightOpen) {
    return "max-w-5xl";
  }
  // Focus mode (collapsed nav + closed inspector) — use the canvas
  return "max-w-6xl";
}
