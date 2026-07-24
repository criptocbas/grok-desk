import { useCallback, useMemo, useRef, useState } from "react";
import type { DeskSession } from "../types";
import { MAX_TRANSCRIPT_ITEMS } from "../lib/caps";

/** Per-session streaming buffers for message/thought/user chunk merge. */
export type StreamBuf = {
  assistant: string;
  thought: string;
  user: string;
  aId: string | null;
  tId: string | null;
  uId: string | null;
  /**
   * True while the current user bubble is still open for merge.
   * Cleared when assistant/thought starts or turn_completed fires.
   * Avoids relying on sessionsRef during rapid session/load replay
   * (ref can lag one event behind setState).
   */
  userTurnOpen: boolean;
};

export type UseSessionStoreOpts = {
  saveDraft: (sessionId: string | null | undefined) => void;
  loadDraft: (sessionId: string | null | undefined) => void;
  /** Called when the active session's project cwd should update (tab focus). */
  setCwd: (cwd: string) => void;
  /** Refresh Diff pane for the focused session cwd. */
  refreshGit: (cwd: string) => void | Promise<void>;
};

/**
 * Open-session state, stream buffers, and tab focus.
 * Does not own connect/listen/send — those stay in App (or later action/bridge hooks).
 */
export function useSessionStore(opts: UseSessionStoreOpts) {
  const { saveDraft, loadDraft, setCwd, refreshGit } = opts;

  const [sessions, setSessions] = useState<DeskSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  /** sessionIds where user hit Stop — late prompt resolve should not re-busy. */
  const cancelRequested = useRef<Set<string>>(new Set());
  /** sessionIds with an in-flight session/prompt (busy may be false after Stop). */
  const inFlightRef = useRef<Set<string>>(new Set());
  /** Last ACP traffic per session (stall detection without re-render spam). */
  const lastActivityRef = useRef<Record<string, number>>({});

  // Per-session streaming buffers keyed by sessionId
  const streamBuf = useRef<Record<string, StreamBuf>>({});

  const patchSession = useCallback(
    (sessionId: string, fn: (s: DeskSession) => DeskSession) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.sessionId !== sessionId) return s;
          const next = fn(s);
          // Cap transcript length so resume/long runs don't blow the webview
          if (next.items.length > MAX_TRANSCRIPT_ITEMS) {
            return {
              ...next,
              items: next.items.slice(-MAX_TRANSCRIPT_ITEMS),
            };
          }
          return next;
        }),
      );
    },
    [],
  );

  /** Focus a session tab, persisting composer draft for the previous tab. */
  const selectSession = useCallback(
    (sessionId: string, sessionCwd: string) => {
      const prev = activeIdRef.current;
      if (prev && prev !== sessionId) {
        saveDraft(prev);
      }
      if (prev !== sessionId) {
        loadDraft(sessionId);
      }
      setActiveId(sessionId);
      setCwd(sessionCwd);
      void refreshGit(sessionCwd);
    },
    [saveDraft, loadDraft, setCwd, refreshGit],
  );

  const cycleSession = useCallback(
    (dir: 1 | -1) => {
      const list = sessionsRef.current;
      if (list.length < 2) return;
      const cur = activeIdRef.current;
      const idx = list.findIndex((s) => s.sessionId === cur);
      const next =
        list[(idx < 0 ? 0 : idx + dir + list.length) % list.length];
      if (next) selectSession(next.sessionId, next.cwd);
    },
    [selectSession],
  );

  const touchActivity = useCallback((sessionId: string) => {
    lastActivityRef.current[sessionId] = Date.now();
  }, []);

  const ensureBuf = (sessionId: string): StreamBuf => {
    if (!streamBuf.current[sessionId]) {
      streamBuf.current[sessionId] = {
        assistant: "",
        thought: "",
        user: "",
        aId: null,
        tId: null,
        uId: null,
        userTurnOpen: false,
      };
    }
    return streamBuf.current[sessionId];
  };

  /** End a stream turn so the next user/assistant/thought gets a new bubble.
   * Critical for session/load replay — without this, every user_message_chunk
   * is wrongly appended into the first user bubble. */
  const clearStreamTurn = (sessionId: string) => {
    const buf = ensureBuf(sessionId);
    buf.assistant = "";
    buf.thought = "";
    buf.user = "";
    buf.aId = null;
    buf.tId = null;
    buf.uId = null;
    buf.userTurnOpen = false;
  };

  const active = useMemo(
    () => sessions.find((s) => s.sessionId === activeId) ?? null,
    [sessions, activeId],
  );

  return {
    sessions,
    setSessions,
    activeId,
    setActiveId,
    active,
    sessionsRef,
    activeIdRef,
    cancelRequested,
    inFlightRef,
    lastActivityRef,
    streamBuf,
    patchSession,
    selectSession,
    cycleSession,
    touchActivity,
    ensureBuf,
    clearStreamTurn,
  };
}
