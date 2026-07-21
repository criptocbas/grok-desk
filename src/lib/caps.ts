/** Prevent webview OOM from multi-hour thought streams / session replay. */
export const MAX_THOUGHT_CHARS = 6_000;
export const MAX_ASSISTANT_CHARS = 400_000;
export const MAX_TRANSCRIPT_ITEMS = 400;

/** No ACP session update for this long while busy → show stall banner. */
export const STALL_MS = 90_000;

/** Debounce git status after file-mutating tools. */
export const GIT_REFRESH_DEBOUNCE_MS = 900;
