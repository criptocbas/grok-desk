import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type {
  AgentInfo,
  AppVersionInfo,
  AvailableCommand,
  DeskSession,
  DiskSession,
  GrokStatus,
  ModelOption,
  PermissionMode,
  PermissionRequest,
  PlanApprovalRequest,
  QueuedPrompt,
  ReviewComment,
  SessionInfo,
  SessionPin,
  GroupResumeTarget,
  UpdateCheckResult,
  UpdatePhase,
  UpdateStartResult,
} from "./types";
import { PlanPane } from "./components/PlanPane";
import { DiffPane } from "./components/DiffPane";
import { ActivityPane } from "./components/ActivityPane";
import { InspectorRail } from "./components/InspectorRail";
import {
  filterCommands,
  getSlashMatch,
} from "./components/SlashPalette";
import { SettingsPane } from "./components/settings/SettingsPane";
import {
  countRunningBackground,
  countRunningSubagents,
  countRunningTools,
  formatDuration,
  isSpawnSubagentTool,
  isSubagentDone,
  isToolDone,
  parseSubagentFinished,
  parseSubagentSpawned,
  parseTaskBackgrounded,
  parseTaskCompleted,
  completeSubagentsFromWaitTool,
  extractSpawnDescription,
  reconcileSubagentList,
  subagentDisplayTitle,
  subagentFromSpawnTool,
  upsertBackgroundTask,
  upsertToolCall,
} from "./activity";
import {
  DEFAULT_EFFORTS,
  isMutatingTool,
  notifyOs,
  pickAllowOption,
  readFileAsDataUrl,
} from "./lib/agentHelpers";
import {
  MAX_ASSISTANT_CHARS,
  MAX_THOUGHT_CHARS,
  MAX_TRANSCRIPT_ITEMS,
  STALL_MS,
} from "./lib/caps";
import { extractText, folderName, shortId, uid } from "./lib/format";
import { chatContentMaxClass } from "./lib/layout";
import {
  isGenericTitle,
  resolveSessionTitle,
  shouldAdoptTitle,
} from "./lib/sessionTitle";
import {
  parseAvailableCommands,
  parsePlanEntries,
  planFromTodoInput,
} from "./lib/planParse";
import { StallBanner } from "./components/chat/StallBanner";
import { PermissionBanner } from "./components/chat/PermissionBanner";
import { WatchingBanner } from "./components/chat/WatchingBanner";
import { TranscriptList } from "./components/chat/TranscriptList";
import { Composer } from "./components/chat/Composer";
import { TerminalDock } from "./components/terminal/TerminalDock";
import { Titlebar } from "./components/layout/Titlebar";
import { UpdateBanner } from "./components/layout/UpdateBanner";
import { LeftNavigator } from "./components/layout/LeftNavigator";
import { EmptyWorkbench } from "./components/layout/EmptyWorkbench";
import { SessionChrome } from "./components/session/SessionChrome";
import { SessionTabStrip } from "./components/session/SessionTabStrip";
import { ShortcutsHelp } from "./components/command/ShortcutsHelp";
import {
  CommandPalette,
  type PaletteCommand,
} from "./components/command/CommandPalette";
import { FileTreePane } from "./components/files/FileTreePane";
import { CoachMarks } from "./components/layout/CoachMarks";
import { useGitDiff } from "./hooks/useGitDiff";
import { useComposerDrafts } from "./hooks/useComposerDrafts";
import { usePinsAndGroups } from "./hooks/usePinsAndGroups";
import { useLayoutChrome } from "./hooks/useLayoutChrome";
import { openPath } from "@tauri-apps/plugin-opener";

export default function App() {
  const [grok, setGrok] = useState<GrokStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [sessions, setSessions] = useState<DeskSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diskSessions, setDiskSessions] = useState<DiskSession[]>([]);
  /** Desktop install version + GitHub update check. */
  const [appVersion, setAppVersion] = useState<AppVersionInfo | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(
    null,
  );
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>("idle");
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);
  const [stderrTail, setStderrTail] = useState<string[]>([]);
  /** Ticks while busy so stall banner can recompute. */
  const [clock, setClock] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  /** Avoid stale closures when answering plan approval reverse-requests. */
  const planApprovalRef = useRef<Record<string, PlanApprovalRequest>>({});
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const {
    prompt,
    setPrompt,
    pendingImages,
    setPendingImages,
    composerCursor,
    setComposerCursor,
    slashIndex,
    setSlashIndex,
    slashDismissed,
    setSlashDismissed,
    saveDraft,
    loadDraft,
    clearDraft,
    clearAllDrafts,
  } = useComposerDrafts();

  const getSessionCwd = useCallback((sessionId: string) => {
    return sessionsRef.current.find((x) => x.sessionId === sessionId)?.cwd;
  }, []);

  const getOpenSession = useCallback((sessionId: string) => {
    const s = sessionsRef.current.find((x) => x.sessionId === sessionId);
    return s ? { cwd: s.cwd, title: s.title } : undefined;
  }, []);

  const onHookError = useCallback((message: string) => {
    setError(message);
  }, []);

  const {
    pins,
    setPins,
    resumingPins,
    setResumingPins,
    pinsRestoredRef,
    sessionGroups,
    refreshPins,
    refreshGroups,
    isPinned,
    pinSession,
    unpinSession,
    reorderPins,
    createGroup,
    renameGroup,
    deleteGroup,
    setGroupCollapsed,
    setSessionGroup,
    setGroupPinned,
  } = usePinsAndGroups({ getOpenSession, onError: onHookError });

  const {
    inspectorTab,
    setInspectorTab,
    terminalOpen,
    setTerminalOpen,
    fileTreeOpen,
    closeFileTree,
    terminalFocused,
    setTerminalFocused,
    shellEpoch,
    setShellEpoch,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    toggleFileTree,
    showShortcuts,
    setShowShortcuts,
    showPalette,
    setShowPalette,
    showRecents,
    setShowRecents,
  } = useLayoutChrome();

  const {
    gitFiles,
    gitIsRepo,
    gitPatch,
    gitSelected,
    gitError,
    gitLoading,
    gitSelectedRef,
    refreshGit,
    scheduleGitRefresh,
    selectGitFile: selectGitFileAt,
  } = useGitDiff({ activeId, getSessionCwd });

  /** sessionIds where user hit Stop — late prompt resolve should not re-busy. */
  const cancelRequested = useRef<Set<string>>(new Set());
  /** sessionIds with an in-flight session/prompt (busy may be false after Stop). */
  const inFlightRef = useRef<Set<string>>(new Set());
  /** Auto-scroll only while the user is pinned near the bottom (per session). */
  const stickBottomRef = useRef<Record<string, boolean>>({});
  /** Last ACP traffic per session (stall detection without re-render spam). */
  const lastActivityRef = useRef<Record<string, number>>({});
  /** Re-render when stick-to-bottom flips so “Jump to latest” can show. */
  const [stickTick, setStickTick] = useState(0);

  const NEAR_BOTTOM_PX = 96;

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  }, []);

  const isStuckToBottom = (sessionId: string | null | undefined) => {
    if (!sessionId) return true;
    return stickBottomRef.current[sessionId] !== false;
  };

  const setStuckToBottom = (sessionId: string, stuck: boolean) => {
    const prev = stickBottomRef.current[sessionId];
    if (prev === stuck) return;
    stickBottomRef.current[sessionId] = stuck;
    setStickTick((n) => n + 1);
  };

  const onTranscriptScroll = useCallback(() => {
    const el = scrollRef.current;
    const sid = activeIdRef.current;
    if (!el || !sid) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStuckToBottom(sid, dist <= NEAR_BOTTOM_PX);
  }, []);

  const scrollToLatest = useCallback(
    (sessionId?: string | null, behavior: ScrollBehavior = "smooth") => {
      const sid = sessionId ?? activeIdRef.current;
      if (sid) setStuckToBottom(sid, true);
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    [],
  );
  // Per-session streaming buffers keyed by sessionId
  const streamBuf = useRef<
    Record<
      string,
      {
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
      }
    >
  >({});

  const active = useMemo(
    () => sessions.find((s) => s.sessionId === activeId) ?? null,
    [sessions, activeId],
  );

  useEffect(() => {
    if (!active?.busy) return;
    const t = setInterval(() => setClock(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [active?.busy, active?.sessionId]);

  const checkForUpdates = useCallback(async () => {
    try {
      const r = await invoke<UpdateCheckResult>("check_for_updates");
      setUpdateCheck(r);
      if (r.updateAvailable) setUpdateBannerDismissed(false);
    } catch {
      /* offline / curl missing — ignore silent check */
    }
  }, []);

  const startAppUpdate = useCallback(async () => {
    try {
      const r = await invoke<UpdateStartResult>("start_self_update");
      setUpdatePhase("running");
      setUpdateBannerDismissed(false);
      setError(null);
      if (r.message) {
        void notifyOs("Grok Desk update", r.message.slice(0, 120));
      }
    } catch (e) {
      setError(String(e));
      setUpdatePhase("failed");
    }
  }, []);

  const restartApp = useCallback(async () => {
    try {
      await invoke("restart_app");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Poll update.log while rebuild runs; flip button to Restart when OK.
  useEffect(() => {
    if (updatePhase !== "running") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const log = await invoke<string>("read_update_log", {
          maxBytes: 12_000,
        });
        if (cancelled) return;
        if (/Update finished OK/i.test(log)) {
          setUpdatePhase("ready");
          setUpdateBannerDismissed(false);
          void notifyOs(
            "Grok Desk update ready",
            "Rebuild finished — restart to use the new build.",
          );
          return;
        }
        if (/Update failed|Update spawn error/i.test(log)) {
          setUpdatePhase("failed");
          setError("App update failed — see Settings → App & updates log.");
        }
      } catch {
        /* ignore poll errors */
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [updatePhase]);

  useEffect(() => {
    void invoke<AppVersionInfo>("app_version_info")
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
    // Check GitHub shortly after boot, then every 6h while the app is open.
    const initial = window.setTimeout(() => void checkForUpdates(), 4_000);
    const periodic = window.setInterval(
      () => void checkForUpdates(),
      6 * 60 * 60 * 1000,
    );
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(periodic);
    };
  }, [checkForUpdates]);

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
    [saveDraft, loadDraft, refreshGit],
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

  const ensureBuf = (sessionId: string) => {
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

  const refreshStatus = useCallback(async () => {
    try {
      setGrok(await invoke<GrokStatus>("grok_status"));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshDisk = useCallback(async () => {
    try {
      const list = await invoke<DiskSession[]>("list_disk_sessions", { limit: 30 });
      setDiskSessions(list);
    } catch {
      /* ignore */
    }
  }, []);

  /** Custom display name — survives restarts (Desk session-titles.json). */
  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      try {
        const saved = await invoke<string | null>("set_session_title", {
          sessionId,
          title,
        });
        const sess = sessionsRef.current.find((s) => s.sessionId === sessionId);
        const sessionCwd = sess?.cwd ?? "";
        const display = resolveSessionTitle(
          sessionCwd,
          saved,
          sess?.title,
          folderName(sessionCwd),
        );
        patchSession(sessionId, (s) => ({ ...s, title: display }));
        if (sess) {
          try {
            await invoke("touch_session_ref", {
              sessionId,
              cwd: sess.cwd,
              title: display,
            });
          } catch {
            /* ignore */
          }
        }
        await refreshPins();
        await refreshDisk();
        await refreshGroups();
      } catch (e) {
        setError(String(e));
      }
    },
    [patchSession, refreshPins, refreshDisk, refreshGroups],
  );

  /**
   * Pull better titles from pins into open tabs (folder-name → descriptive).
   */
  useEffect(() => {
    if (pins.length === 0 || sessions.length === 0) return;
    setSessions((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const pin = pins.find((p) => p.sessionId === s.sessionId);
        if (!pin?.title) return s;
        if (!shouldAdoptTitle(s.cwd, s.title, pin.title)) return s;
        changed = true;
        return {
          ...s,
          title: resolveSessionTitle(s.cwd, pin.title, s.title),
        };
      });
      return changed ? next : prev;
    });
  }, [pins, sessions.length]);

  useEffect(() => {
    void refreshStatus();
    void refreshDisk();
    void refreshPins();
    void refreshGroups();
    invoke<string>("default_cwd").then(setCwd).catch(() => {});
  }, [refreshStatus, refreshDisk, refreshPins, refreshGroups]);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    const track = (unlisten: () => void) => {
      if (cancelled) {
        unlisten();
        return;
      }
      unsubs.push(unlisten);
    };

    void listen<{ running: boolean }>("acp://status", (e) => {
      setRunning(!!e.payload?.running);
    }).then(track);

    void listen<string>("acp://stderr", (e) => {
      setStderrTail((prev) => [...prev.slice(-40), e.payload]);
    }).then(track);

    void listen<PermissionRequest>("acp://permission", (e) => {
      const p = e.payload;
      const sid = p.sessionId;
      if (!sid) return;
      touchActivity(sid);
      const sess = sessionsRef.current.find((s) => s.sessionId === sid);
      // Client-side always-approve: auto-select an allow option without a card.
      if (sess?.permissionMode === "always-approve") {
        const optionId = pickAllowOption(p.options ?? []);
        void invoke("permission_respond", {
          requestId: p.requestId,
          optionId,
        }).catch((err) => setError(String(err)));
        return;
      }
      patchSession(sid, (s) => ({
        ...s,
        permissions: [...s.permissions, p],
      }));
      // Nudge if a background tab needs attention
      if (sid !== activeIdRef.current) {
        notifyOs(
          "Grok Desk · permission needed",
          sess?.title || shortId(sid),
        );
      }
    }).then(track);

    void listen<PlanApprovalRequest>("acp://plan-approval", (e) => {
      const p = e.payload;
      if (!p?.sessionId) return;
      planApprovalRef.current[p.sessionId] = p;
      setInspectorTab("plan");
      setActiveId(p.sessionId);
      patchSession(p.sessionId, (s) => ({
        ...s,
        planApproval: p,
        planDoc: p.planContent ?? s.planDoc,
        modeId: "plan",
        items: [
          ...s.items,
          {
            id: uid(),
            role: "system",
            text: "Plan ready — use the Plan pane to Approve, request changes, or abandon.",
          },
        ],
      }));
    }).then(track);

    void listen<Record<string, unknown>>("acp://session-update", (e) => {
      const params = e.payload ?? {};
      const sessionId =
        (params.sessionId as string) ||
        (params.session_id as string) ||
        "";
      if (!sessionId) return;

      const update = (params.update ?? params) as Record<string, unknown>;
      const kind = (update.sessionUpdate ?? update.session_update) as
        | string
        | undefined;
      if (!kind) return;

      // Any ACP traffic counts as liveness (stall detection).
      touchActivity(sessionId);

      if (kind === "agent_message_chunk") {
        const chunk = extractText(update.content);
        if (!chunk) return;
        const buf = ensureBuf(sessionId);
        // User turn is closed once the agent speaks (or thinks).
        buf.userTurnOpen = false;
        // New assistant bubble if prior turn was cleared (resume / turn_completed).
        if (!buf.aId) {
          buf.aId = uid();
          buf.assistant = "";
        }
        buf.assistant += chunk;
        if (buf.assistant.length > MAX_ASSISTANT_CHARS) {
          buf.assistant = buf.assistant.slice(-MAX_ASSISTANT_CHARS);
        }
        const id = buf.aId;
        const text = buf.assistant;
        patchSession(sessionId, (s) => {
          const rest = s.items.filter((i) => i.id !== id);
          return {
            ...s,
            items: [...rest, { id, role: "assistant", text }],
          };
        });
      } else if (kind === "user_message_chunk") {
        // Live: optimistic bubble sets userTurnOpen + uId — merge only then.
        // Resume/load: each user_message_chunk is a full turn; after agent
        // content, userTurnOpen is false so we start a new bubble (not append).
        const chunk = extractText(update.content);
        if (!chunk) return;
        const buf = ensureBuf(sessionId);

        if (buf.userTurnOpen && buf.uId) {
          const id = buf.uId;
          if (buf.user === chunk) return;
          // Cumulative full-text stream (ACP replaces with longer prefix)
          if (chunk.startsWith(buf.user) && chunk.length >= buf.user.length) {
            buf.user = chunk;
            patchSession(sessionId, (s) => {
              const i2 = s.items.findIndex((it) => it.id === id);
              if (i2 < 0) {
                return {
                  ...s,
                  items: [...s.items, { id, role: "user", text: chunk }],
                };
              }
              const next = s.items.slice();
              next[i2] = { ...next[i2], text: chunk };
              return { ...s, items: next };
            });
            return;
          }
          // Live delta append
          if (!buf.user.includes(chunk) && !chunk.startsWith(buf.user)) {
            buf.user = buf.user + chunk;
            const text = buf.user;
            patchSession(sessionId, (s) => {
              const i2 = s.items.findIndex((it) => it.id === id);
              if (i2 < 0) {
                return {
                  ...s,
                  items: [...s.items, { id, role: "user", text }],
                };
              }
              const next = s.items.slice();
              next[i2] = { ...next[i2], text };
              return { ...s, items: next };
            });
            return;
          }
          // Exact / already-contained echo
          if (buf.user.includes(chunk) || chunk === buf.user) return;
        }

        // New user turn (session load after agent replied, or first message)
        clearStreamTurn(sessionId);
        const id = uid();
        const b = ensureBuf(sessionId);
        b.uId = id;
        b.user = chunk;
        b.userTurnOpen = true;
        patchSession(sessionId, (s) => ({
          ...s,
          items: [...s.items, { id, role: "user" as const, text: chunk }],
        }));
      } else if (kind === "agent_thought_chunk") {
        const chunk = extractText(update.content);
        if (!chunk) return;
        const buf = ensureBuf(sessionId);
        buf.userTurnOpen = false;
        if (!buf.tId) {
          buf.tId = uid();
          buf.thought = "";
        }
        buf.thought += chunk;
        // Cap hard — unbounded thoughts OOM the webview (crash mid-run).
        if (buf.thought.length > MAX_THOUGHT_CHARS) {
          buf.thought =
            "…[thought truncated]…\n" +
            buf.thought.slice(-MAX_THOUGHT_CHARS);
        }
        const id = buf.tId;
        const text = buf.thought;
        patchSession(sessionId, (s) => {
          const rest = s.items.filter((i) => i.id !== id);
          return {
            ...s,
            items: [
              ...rest,
              { id, role: "thought", text, meta: "thinking" },
            ],
          };
        });
      } else if (kind === "plan") {
        const entries = parsePlanEntries(update.entries);
        if (entries) {
          patchSession(sessionId, (s) => ({ ...s, plan: entries }));
        }
      } else if (kind === "plan_doc") {
        const content =
          typeof update.content === "string" ? update.content : null;
        if (content) {
          patchSession(sessionId, (s) => ({ ...s, planDoc: content }));
        }
      } else if (kind === "current_mode_update") {
        const modeId =
          (update.currentModeId as string) ||
          (update.current_mode_id as string) ||
          null;
        patchSession(sessionId, (s) => ({ ...s, modeId }));
      } else if (kind === "available_commands_update") {
        const raw =
          (update.availableCommands as unknown[]) ||
          (update.available_commands as unknown[]) ||
          [];
        const cmds = parseAvailableCommands(raw);
        if (cmds.length) {
          patchSession(sessionId, (s) => ({
            ...s,
            availableCommands: cmds,
          }));
        }
      } else if (kind === "tool_call" || kind === "tool_call_update") {
        // Tools close the user-merge window (same as agent speech).
        ensureBuf(sessionId).userTurnOpen = false;
        const planFromTool = planFromTodoInput(update.rawInput ?? update);
        const id =
          (update.toolCallId as string) ||
          (update.tool_call_id as string) ||
          "";

        if (!id && kind === "tool_call_update") return;

        // Fallback path: synthesize SubagentItem from spawn tool payloads even if
        // `_x.ai/session/update` subagent_* events never arrive on the wire.
        const fromSpawn = subagentFromSpawnTool(update, Date.now());
        if (fromSpawn) {
          setInspectorTab((tab) => tab ?? "activity");
        }

        patchSession(sessionId, (s) => {
          const nextTools = upsertToolCall(s.tools, update, Date.now());
          const t = nextTools.find((x) => x.id === id);
          const tTitle = t?.title || "tool";
          const tStatus = t?.status || "in_progress";
          const isSpawn =
            !!fromSpawn ||
            t?.category === "subagent" ||
            isSpawnSubagentTool(t?.name, tTitle, t?.raw ?? update);

          let subagents = s.subagents ?? [];
          let items = s.items;

          if (fromSpawn) {
            // Prefer description from this update; fall back to tool title if strong.
            const label =
              fromSpawn.description ||
              extractSpawnDescription(update) ||
              (tTitle &&
              tTitle !== "spawn_subagent" &&
              tTitle.toLowerCase() !== "subagent"
                ? tTitle
                : undefined) ||
              fromSpawn.description;
            const patch = label
              ? { ...fromSpawn, description: label }
              : fromSpawn;
            subagents = reconcileSubagentList(subagents, patch);
            const row = subagents.find(
              (x) => x.subagentId === patch.subagentId,
            );
            const cardId = `subagent-${patch.subagentId}`;
            const pendingCard = patch.toolCallId
              ? `subagent-pending:${patch.toolCallId}`
              : null;
            const title = row
              ? subagentDisplayTitle(row)
              : label || tTitle || "Subagent";
            const metaParts = [
              patch.status ?? row?.status ?? "running",
              patch.subagentType || row?.subagentType,
            ].filter(Boolean);
            const card = {
              id: cardId,
              role: "subagent" as const,
              text: title,
              meta: metaParts.join(" · "),
              status: patch.status ?? row?.status ?? "running",
              subagentId: patch.subagentId,
            };
            items = items
              .filter(
                (i) =>
                  i.id !== `tool-${id}` &&
                  i.id !== pendingCard &&
                  !(
                    i.role === "subagent" &&
                    i.subagentId === patch.subagentId &&
                    i.id.startsWith("subagent-pending:")
                  ),
              )
              .map((i) =>
                i.id === cardId || i.subagentId === patch.subagentId
                  ? { ...i, ...card }
                  : i,
              );
            if (!items.some((i) => i.subagentId === patch.subagentId)) {
              items = [...items, card];
            }
          }

          // Wait / get_output completion → mark children done (finish fallback)
          subagents = completeSubagentsFromWaitTool(subagents, update, Date.now());

          // Sync transcript cards to latest subagent titles + statuses
          items = items.map((i) => {
            if (i.role !== "subagent" || !i.subagentId) return i;
            const row = subagents.find((x) => x.subagentId === i.subagentId);
            if (!row) return i;
            const dur =
              row.durationMs != null
                ? formatDuration(row.durationMs)
                : row.startedAt != null && row.endedAt != null
                  ? formatDuration(row.endedAt - row.startedAt)
                  : "";
            const metaParts = [
              row.status,
              row.subagentType,
              dur || null,
            ].filter(Boolean);
            return {
              ...i,
              id: `subagent-${row.subagentId}`,
              text: subagentDisplayTitle(row),
              meta: metaParts.join(" · "),
              status: row.status,
              subagentId: row.subagentId,
            };
          });

          if (isSpawn) {
            // Strip any tool bubble that already leaked into the transcript
            items = items.filter((i) => i.id !== `tool-${id}`);
            return {
              ...s,
              tools: nextTools,
              subagents,
              items,
              plan: planFromTool ?? s.plan,
            };
          }

          const nextItems = items.some((i) => i.id === `tool-${id}`)
            ? items.map((i) =>
                i.id === `tool-${id}`
                  ? { ...i, text: tTitle, meta: tStatus, status: tStatus }
                  : i,
              )
            : id
              ? [
                  ...items,
                  {
                    id: `tool-${id}`,
                    role: "tool" as const,
                    text: tTitle,
                    meta: tStatus,
                    status: tStatus,
                  },
                ]
              : items;
          return {
            ...s,
            tools: nextTools,
            subagents,
            items: nextItems,
            plan: planFromTool ?? s.plan,
          };
        });

        const prevTools =
          sessionsRef.current.find((s) => s.sessionId === sessionId)?.tools ??
          [];
        const tools = upsertToolCall(prevTools, update, Date.now());
        const tool = tools.find((t) => t.id === id);
        const title = tool?.title || "tool";
        const status = tool?.status || "in_progress";
        const kindStr = tool?.kind;
        if (isToolDone(status) && isMutatingTool(title, kindStr)) {
          scheduleGitRefresh(sessionId);
        }
      } else if (kind === "subagent_spawned") {
        const spawned = parseSubagentSpawned(update, Date.now());
        if (!spawned) return;
        setInspectorTab((t) => t ?? "activity");
        patchSession(sessionId, (s) => {
          const subagents = reconcileSubagentList(s.subagents ?? [], spawned);
          const row = subagents.find((x) => x.subagentId === spawned.subagentId);
          const cardId = `subagent-${spawned.subagentId}`;
          const title = row
            ? subagentDisplayTitle(row)
            : spawned.description || "Subagent";
          const metaParts = [
            "running",
            spawned.subagentType,
            spawned.model,
            spawned.contextSource === "resumed" || spawned.resumedFrom
              ? "resumed"
              : null,
          ].filter(Boolean);
          const meta = metaParts.join(" · ");
          // Drop tool spam + pending placeholders for this description
          let items = s.items.filter(
            (i) =>
              !(i.role === "tool" && i.text === spawned.description) &&
              !(
                i.role === "subagent" &&
                (i.subagentId === spawned.subagentId ||
                  i.text === spawned.description) &&
                typeof i.id === "string" &&
                i.id.startsWith("subagent-pending:")
              ),
          );
          const card = {
            id: cardId,
            role: "subagent" as const,
            text: title,
            meta,
            status: "running" as const,
            subagentId: spawned.subagentId,
          };
          items = items.some(
            (i) => i.id === cardId || i.subagentId === spawned.subagentId,
          )
            ? items.map((i) =>
                i.id === cardId || i.subagentId === spawned.subagentId
                  ? { ...i, ...card }
                  : i,
              )
            : [...items, card];
          return { ...s, subagents, items };
        });
      } else if (kind === "subagent_finished") {
        const fin = parseSubagentFinished(update, Date.now());
        if (!fin) return;
        let finishedDesc = "Subagent";
        patchSession(sessionId, (s) => {
          // Merge into list even if we only had pending:toolId rows
          const subagents = reconcileSubagentList(s.subagents ?? [], {
            ...fin,
            status: fin.status || "completed",
          });
          const row = subagents.find((x) => x.subagentId === fin.subagentId);
          const finishTitle = row
            ? subagentDisplayTitle(row)
            : finishedDesc;
          finishedDesc = finishTitle;
          const st = row?.status || fin.status || "completed";
          const dur =
            row?.durationMs != null
              ? formatDuration(row.durationMs)
              : row?.startedAt != null && row?.endedAt != null
                ? formatDuration(row.endedAt - row.startedAt)
                : "";
          const metaParts = [
            st,
            dur || null,
            row?.toolCalls != null ? `${row.toolCalls} tools` : null,
          ].filter(Boolean);
          const cardId = `subagent-${fin.subagentId}`;
          // Update card by real id, or by matching running subagent card text
          let items = s.items.map((i) => {
            if (i.id === cardId || i.subagentId === fin.subagentId) {
              return {
                ...i,
                id: cardId,
                text: finishTitle,
                meta: metaParts.join(" · "),
                status: st,
                subagentId: fin.subagentId,
              };
            }
            // Fold pending / same-description running cards into the finished id
            if (
              i.role === "subagent" &&
              row &&
              (i.subagentId === `pending:${row.toolCallId}` ||
                i.text === row.description ||
                (i.text === "Subagent" &&
                  row.toolCallId &&
                  i.subagentId === `pending:${row.toolCallId}`)) &&
              (i.status === "running" ||
                String(i.id).startsWith("subagent-pending:") ||
                String(i.subagentId || "").startsWith("pending:"))
            ) {
              return {
                ...i,
                id: cardId,
                text: finishTitle,
                meta: metaParts.join(" · "),
                status: st,
                subagentId: fin.subagentId,
              };
            }
            return i;
          });
          if (!items.some((i) => i.id === cardId || i.subagentId === fin.subagentId)) {
            items = [
              ...items,
              {
                id: cardId,
                role: "subagent" as const,
                text: finishTitle,
                meta: metaParts.join(" · "),
                status: st,
                subagentId: fin.subagentId,
              },
            ];
          }
          // Mark linked spawn tool done if we can match by category
          let tools = s.tools;
          if (row?.toolCallId) {
            tools = tools.map((t) =>
              t.id === row.toolCallId
                ? {
                    ...t,
                    status: isSubagentDone(st)
                      ? st === "failed"
                        ? "failed"
                        : "completed"
                      : t.status,
                    endedAt: row.endedAt ?? Date.now(),
                    category: "subagent" as const,
                  }
                : t,
            );
          }
          return { ...s, subagents, items, tools };
        });
        if (sessionId !== activeIdRef.current) {
          const title =
            sessionsRef.current.find((s) => s.sessionId === sessionId)?.title ||
            shortId(sessionId);
          notifyOs(
            "Grok Desk · subagent finished",
            `${finishedDesc} · ${title}`,
          );
        }
      } else if (kind === "task_backgrounded") {
        const task = parseTaskBackgrounded(update, Date.now());
        if (!task) return;
        patchSession(sessionId, (s) => {
          let tools = s.tools;
          if (task.toolCallId) {
            tools = tools.map((t) =>
              t.id === task.toolCallId
                ? {
                    ...t,
                    status: "background",
                    category: "background" as const,
                    detail: task.description || task.command || t.detail,
                  }
                : t,
            );
          }
          return {
            ...s,
            tools,
            backgroundTasks: upsertBackgroundTask(
              s.backgroundTasks ?? [],
              task,
            ),
          };
        });
      } else if (kind === "task_completed") {
        const patch = parseTaskCompleted(update, Date.now());
        if (!patch) return;
        patchSession(sessionId, (s) => {
          const tasks = upsertBackgroundTask(s.backgroundTasks ?? [], patch);
          const linked = tasks.find((t) => t.taskId === patch.taskId);
          let tools = s.tools;
          if (linked?.toolCallId) {
            tools = tools.map((t) =>
              t.id === linked.toolCallId
                ? {
                    ...t,
                    status: patch.status === "failed" ? "failed" : "completed",
                    endedAt: patch.endedAt ?? Date.now(),
                    category: "background" as const,
                  }
                : t,
            );
          }
          return { ...s, tools, backgroundTasks: tasks };
        });
      } else if (kind === "turn_completed") {
        // Close stream ids so the next turn's chunks don't merge into this one
        // (session/load replays many turns through the same listener).
        clearStreamTurn(sessionId);
        // Defensive: close tools that never got a terminal status.
        // Leave backgrounded tools alone — they outlive the turn.
        patchSession(sessionId, (s) => ({
          ...s,
          tools: s.tools.map((t) => {
            if (isToolDone(t.status)) return t;
            if (t.status === "background" || t.category === "background")
              return t;
            return {
              ...t,
              status: "completed",
              endedAt: t.endedAt ?? Date.now(),
            };
          }),
        }));
      }
    }).then(track);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [patchSession, scheduleGitRefresh, touchActivity]);

  // Follow streaming only if the user hasn't scrolled up to read history.
  useEffect(() => {
    if (!active?.sessionId) return;
    if (!isStuckToBottom(active.sessionId)) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    // stickTick intentionally omitted — only follow content growth when stuck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.items, active?.permissions, active?.sessionId]);

  // Keyboard shortcuts (mission control) — see src/lib/shortcuts.ts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inTerm =
        terminalFocused ||
        Boolean(target?.closest?.("[data-grok-terminal]"));
      const typing =
        (target &&
          (target.tagName === "TEXTAREA" ||
            target.tagName === "INPUT" ||
            target.tagName === "SELECT" ||
            target.isContentEditable)) ||
        inTerm;

      // Ctrl/Cmd+K — command palette (works while typing)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
        setShowShortcuts(false);
        return;
      }

      // Ctrl+/ or Cmd+/ — shortcuts help (works even while typing)
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        setShowPalette(false);
        return;
      }

      // Ctrl/Cmd+` — toggle project terminal (works while typing / in shell)
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        (e.key === "`" || e.code === "Backquote")
      ) {
        e.preventDefault();
        setTerminalOpen((v) => {
          if (v) setTerminalFocused(false);
          return !v;
        });
        return;
      }

      // Esc layers: palette → help → terminal → file tree → inspector
      if (e.key === "Escape") {
        if (showPalette) {
          setShowPalette(false);
          return;
        }
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (terminalOpen) {
          setTerminalOpen(false);
          setTerminalFocused(false);
          return;
        }
        if (fileTreeOpen) {
          closeFileTree();
          return;
        }
        if (inspectorTab) {
          setInspectorTab(null);
          return;
        }
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle open sessions (browser-style).
      // Use e.code + capture so WebKitGTK still sees Shift+Tab; also
      // Ctrl+PageDown / Ctrl+PageUp like Chrome.
      if (e.ctrlKey || e.metaKey) {
        const isTab =
          e.code === "Tab" || e.key === "Tab" || e.key === "ISO_Left_Tab";
        const nextTab =
          (isTab && !e.shiftKey) ||
          e.key === "PageDown" ||
          e.code === "PageDown";
        const prevTab =
          (isTab && e.shiftKey) ||
          e.key === "PageUp" ||
          e.code === "PageUp" ||
          e.key === "ISO_Left_Tab";
        if (nextTab || prevTab) {
          e.preventDefault();
          e.stopPropagation();
          cycleSession(prevTab ? -1 : 1);
          return;
        }
      }

      // Alt+P/D/A/, — inspector; Alt+B — sidebar
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === "p") {
          e.preventDefault();
          setInspectorTab((t) => (t === "plan" ? null : "plan"));
          return;
        }
        if (k === "d") {
          e.preventDefault();
          setInspectorTab((t) => (t === "diff" ? null : "diff"));
          return;
        }
        if (k === "a") {
          e.preventDefault();
          setInspectorTab((t) => (t === "activity" ? null : "activity"));
          return;
        }
        if (k === "f") {
          e.preventDefault();
          if (activeIdRef.current) toggleFileTree();
          return;
        }
        if (k === "," || e.code === "Comma") {
          e.preventDefault();
          setInspectorTab((t) => (t === "settings" ? null : "settings"));
          return;
        }
        if (k === "b") {
          e.preventDefault();
          setSidebarCollapsed((v) => !v);
          return;
        }
      }

      // Ctrl/Cmd+B — collapse left rail (IDE-familiar)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "b") {
        if (typing) return;
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
        return;
      }

      // Ctrl/Cmd+N — new session
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "n") {
        if (typing) return;
        e.preventDefault();
        if (cwd) void openSession();
        return;
      }

      // Ctrl/Cmd+L — focus composer (works from terminal too)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "l") {
        if (typing && target?.tagName === "TEXTAREA" && !inTerm) return;
        e.preventDefault();
        setTerminalFocused(false);
        focusComposer();
        return;
      }

      if (typing) return;
    };
    // Capture so focused inputs / WebView chrome don't swallow Ctrl(+Shift)+Tab.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    showShortcuts,
    showPalette,
    inspectorTab,
    terminalOpen,
    terminalFocused,
    fileTreeOpen,
    cycleSession,
    focusComposer,
    cwd,
    toggleFileTree,
  ]);

  // Auto-open Plan when agent drops a plan checklist (once per arrival)
  useEffect(() => {
    if (!active) return;
    if (active.planApproval) {
      setInspectorTab("plan");
      return;
    }
    if (active.modeId === "plan" && active.plan.length > 0) {
      setInspectorTab((t) => t ?? "plan");
    }
  }, [active?.planApproval, active?.modeId, active?.plan.length, active?.sessionId]);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const i = await invoke<AgentInfo>("agent_start");
      setInfo(i);
      setRunning(true);
      await refreshDisk();
      await refreshPins();
      // Auto-resume pinned conversations once per agent connection.
      if (!pinsRestoredRef.current) {
        pinsRestoredRef.current = true;
        void resumePinnedSessions();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      try {
        await invoke("pty_kill_all");
      } catch {
        /* optional — shells may already be gone */
      }
      await invoke("agent_stop");
      setRunning(false);
      setInfo(null);
      setSessions([]);
      setActiveId(null);
      clearAllDrafts();
      loadDraft(null);
      pinsRestoredRef.current = false;
      setTerminalFocused(false);
    } catch (e) {
      setError(String(e));
    }
  };

  const openSession = async () => {
    setError(null);
    try {
      if (!running) await connect();
      const s = await invoke<SessionInfo>("session_new", { cwd });
      // Prefer any pre-existing custom title (rare for brand-new ids)
      let customTitle: string | null = null;
      try {
        customTitle =
          (await invoke<string | null>("get_session_title", {
            sessionId: s.sessionId,
          })) ?? null;
      } catch {
        /* ignore */
      }
      const desk: DeskSession = {
        sessionId: s.sessionId,
        cwd: s.cwd,
        title: resolveSessionTitle(s.cwd, customTitle, s.title),
        modelId: s.modelId,
        reasoningEffort: s.reasoningEffort ?? null,
        availableModels: s.availableModels ?? info?.availableModels ?? [],
        permissionMode: "default",
        promptQueue: [],
        availableCommands: [],
        items: [
          {
            id: uid(),
            role: "system",
            text: `Session ${shortId(s.sessionId)} · ${s.cwd}`,
          },
        ],
        tools: [],
        backgroundTasks: [],
        subagents: [],
        permissions: [],
        busy: false,
        createdAt: Date.now(),
        plan: [],
        modeId: null,
        planDoc: null,
        reviewComments: [],
        planApproval: null,
      };
      stickBottomRef.current[s.sessionId] = true;
      // Preserve draft of the tab we're leaving; new session starts empty.
      saveDraft(activeIdRef.current);
      setSessions((prev) => [desk, ...prev]);
      setActiveId(s.sessionId);
      loadDraft(s.sessionId);
      void refreshGit(s.cwd);
      streamBuf.current[s.sessionId] = {
        assistant: "",
        thought: "",
        user: "",
        aId: null,
        tId: null,
        uId: null,
        userTurnOpen: false,
      };
      await refreshDisk();
    } catch (e) {
      setError(String(e));
    }
  };

  /**
   * Load a disk session into a tab (Recents / Pins).
   * @param activate — focus the tab when true (default). Bulk pin restore uses false then focuses first.
   */
  const resumeSession = async (
    d: {
      sessionId: string;
      cwd: string;
      title?: string | null;
      modelId?: string | null;
    },
    opts?: { activate?: boolean; quiet?: boolean },
  ): Promise<boolean> => {
    const activate = opts?.activate !== false;
    const quiet = opts?.quiet === true;
    if (!quiet) {
      setError(null);
      setShowRecents(false);
    }
    try {
      // Ensure agent is up (idempotent if already connected).
      if (!running) {
        const i = await invoke<AgentInfo>("agent_start");
        setInfo(i);
        setRunning(true);
        pinsRestoredRef.current = true;
      }

      let alreadyOpen = false;
      setSessions((prev) => {
        if (prev.some((s) => s.sessionId === d.sessionId)) {
          alreadyOpen = true;
          return prev;
        }
        const desk: DeskSession = {
          sessionId: d.sessionId,
          cwd: d.cwd,
          title: resolveSessionTitle(d.cwd, d.title),
          modelId: d.modelId ?? null,
          reasoningEffort: null,
          availableModels: info?.availableModels ?? [],
          permissionMode: "default",
          promptQueue: [],
          availableCommands: [],
          items: [
            {
              id: uid(),
              role: "system",
              text: `Loading ${shortId(d.sessionId)}…`,
            },
          ],
          tools: [],
          backgroundTasks: [],
          subagents: [],
          permissions: [],
          busy: true,
          createdAt: Date.now(),
          plan: [],
          modeId: null,
          planDoc: null,
          reviewComments: [],
          planApproval: null,
        };
        stickBottomRef.current[d.sessionId] = true;
        return [desk, ...prev];
      });
      if (activate) {
        selectSession(d.sessionId, d.cwd);
      }
      if (alreadyOpen) {
        // Session already a tab — still reconcile title (pin/custom may be better).
        let customTitle: string | null = null;
        try {
          customTitle =
            (await invoke<string | null>("get_session_title", {
              sessionId: d.sessionId,
            })) ?? null;
        } catch {
          /* optional */
        }
        patchSession(d.sessionId, (s) => {
          const next = resolveSessionTitle(
            s.cwd,
            customTitle,
            d.title,
            s.title,
          );
          if (next === s.title) return s;
          return { ...s, title: next };
        });
        return true;
      }

      streamBuf.current[d.sessionId] = {
        assistant: "",
        thought: "",
        user: "",
        aId: null,
        tId: null,
        uId: null,
        userTurnOpen: false,
      };
      if (activate) setCwd(d.cwd);

      const loaded = await invoke<SessionInfo>("session_load", {
        sessionId: d.sessionId,
        cwd: d.cwd,
      });
      let customTitle: string | null = null;
      try {
        customTitle =
          (await invoke<string | null>("get_session_title", {
            sessionId: d.sessionId,
          })) ?? null;
      } catch {
        /* optional */
      }
      let planDoc: string | null = null;
      try {
        planDoc =
          (await invoke<string | null>("read_plan_doc", {
            sessionId: d.sessionId,
            cwd: d.cwd,
          })) ?? null;
      } catch {
        /* optional */
      }
      patchSession(d.sessionId, (s) => ({
        ...s,
        busy: false,
        planDoc,
        modelId: loaded.modelId ?? s.modelId,
        reasoningEffort: loaded.reasoningEffort ?? s.reasoningEffort,
        availableModels:
          loaded.availableModels?.length
            ? loaded.availableModels
            : s.availableModels,
        title: resolveSessionTitle(s.cwd, customTitle, d.title, s.title),
        items: [
          ...s.items
            .filter((i) => i.role !== "system" || !i.text.startsWith("Loading"))
            .map((i) =>
              i.role === "thought" && i.text.length > MAX_THOUGHT_CHARS
                ? {
                    ...i,
                    text:
                      "…[thought truncated on resume]…\n" +
                      i.text.slice(-MAX_THOUGHT_CHARS),
                  }
                : i,
            ),
          {
            id: uid(),
            role: "system",
            text: `Resumed · ${d.cwd}`,
          },
        ],
      }));
      if (activate) void refreshGit(d.cwd);
      return true;
    } catch (e) {
      if (!quiet) setError(String(e));
      patchSession(d.sessionId, (s) => ({
        ...s,
        busy: false,
        items: [
          ...s.items.filter(
            (i) => i.role !== "system" || !i.text.startsWith("Loading"),
          ),
          {
            id: uid(),
            role: "system",
            text: `Failed to resume: ${String(e)}`,
          },
        ],
      }));
      return false;
    }
  };

  const resumeDisk = async (d: DiskSession) => {
    await resumeSession(d, { activate: true });
  };

  /** After Connect: open pinned sessions + all members of pinned groups. */
  const resumePinnedSessions = async () => {
    type Target = {
      sessionId: string;
      cwd: string;
      title?: string | null;
    };
    const targets: Target[] = [];
    const seen = new Set<string>();

    const push = (t: Target) => {
      if (seen.has(t.sessionId) || !t.cwd) return;
      seen.add(t.sessionId);
      targets.push(t);
    };

    try {
      const list = await invoke<SessionPin[]>("list_pins");
      setPins(list);
      for (const p of list.filter((x) => !x.missing)) {
        push({ sessionId: p.sessionId, cwd: p.cwd, title: p.title });
      }
    } catch {
      for (const p of pins.filter((x) => !x.missing)) {
        push({ sessionId: p.sessionId, cwd: p.cwd, title: p.title });
      }
    }

    try {
      const groupTargets = await invoke<GroupResumeTarget[]>(
        "list_pinned_group_sessions",
      );
      for (const t of groupTargets) {
        push({
          sessionId: t.sessionId,
          cwd: t.cwd,
          title: t.title,
        });
      }
    } catch {
      /* optional */
    }

    await refreshGroups();

    if (targets.length === 0) return;

    setResumingPins(true);
    try {
      let firstId: string | null = null;
      let firstCwd: string | null = null;
      for (const t of targets) {
        if (sessionsRef.current.some((s) => s.sessionId === t.sessionId)) {
          if (!firstId) {
            firstId = t.sessionId;
            firstCwd = t.cwd;
          }
          continue;
        }
        const ok = await resumeSession(
          {
            sessionId: t.sessionId,
            cwd: t.cwd,
            title: t.title,
          },
          { activate: false, quiet: true },
        );
        if (ok && !firstId) {
          firstId = t.sessionId;
          firstCwd = t.cwd;
        }
      }
      if (firstId && firstCwd) {
        setActiveId(firstId);
        setCwd(firstCwd);
        void refreshGit(firstCwd);
      }
    } finally {
      setResumingPins(false);
    }
  };

  const closeSession = (sessionId: string) => {
    const wasActive = activeIdRef.current === sessionId;
    clearDraft(sessionId);
    delete streamBuf.current[sessionId];
    delete stickBottomRef.current[sessionId];
    inFlightRef.current.delete(sessionId);
    void invoke("pty_kill_session", { sessionId }).catch(() => {
      /* shell may not exist */
    });
    if (wasActive) setTerminalFocused(false);
    setSessions((prev) => {
      const next = prev.filter((s) => s.sessionId !== sessionId);
      if (wasActive) {
        const nextS = next[0];
        if (nextS) {
          // Don't saveDraft — closed tab's composer is discarded with draftsRef delete.
          loadDraft(nextS.sessionId);
          setActiveId(nextS.sessionId);
          setCwd(nextS.cwd);
          void refreshGit(nextS.cwd);
        } else {
          setActiveId(null);
          loadDraft(null);
        }
      }
      return next;
    });
  };

  const pushPendingImage = useCallback(
    (mimeType: string, data: string, name?: string) => {
      const mime = mimeType || "image/png";
      const previewUrl = `data:${mime};base64,${data}`;
      setPendingImages((prev) => [
        ...prev,
        {
          id: uid(),
          mimeType: mime,
          data,
          name: name || `paste-${Date.now()}.png`,
          previewUrl,
        },
      ]);
    },
    [],
  );

  const addImageFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(
      (f) =>
        f.type.startsWith("image/") ||
        (!f.type && /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name)),
    );
    for (const file of list) {
      const dataUrl = await readFileAsDataUrl(file);
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) continue;
      pushPendingImage(
        m[1] || file.type || "image/png",
        m[2],
        file.name || undefined,
      );
    }
  };

  /** Wayland/WebKit often omits screenshot pixels from paste events — use OS clipboard. */
  const tryNativeClipboardImage = useCallback(async (): Promise<boolean> => {
    try {
      const img = await invoke<{
        mimeType: string;
        data: string;
        name: string;
      } | null>("clipboard_read_image");
      if (!img?.data) return false;
      pushPendingImage(img.mimeType, img.data, img.name);
      return true;
    } catch {
      return false;
    }
  }, [pushPendingImage]);

  const onComposerPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const cd = e.clipboardData;
    const files: File[] = [];

    // 1) clipboardData.files (some WebKit builds put screenshots here)
    if (cd?.files?.length) {
      for (const f of Array.from(cd.files)) {
        if (
          f.type.startsWith("image/") ||
          (!f.type && /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name))
        ) {
          files.push(f);
        }
      }
    }

    // 2) clipboardData.items → getAsFile()
    if (cd?.items) {
      for (const item of Array.from(cd.items)) {
        if (item.kind === "file" || item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (
            f &&
            (f.type.startsWith("image/") ||
              !f.type ||
              /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name))
          ) {
            if (!files.some((x) => x.name === f.name && x.size === f.size)) {
              files.push(f);
            }
          }
        }
      }
    }

    if (files.length) {
      e.preventDefault();
      void addImageFiles(files);
      return;
    }

    // 3) Async Clipboard API + 4) native wl-paste/xclip
    // WebKit on Wayland often delivers an empty paste event for screenshots.
    // Only intercept when there's no plain text so we don't steal normal pastes.
    const hasText = Boolean(cd?.getData("text/plain")?.trim());
    if (hasText) return;

    e.preventDefault();
    void (async () => {
      try {
        if (navigator.clipboard?.read) {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const type = item.types.find((t) => t.startsWith("image/"));
            if (!type) continue;
            const blob = await item.getType(type);
            const file = new File(
              [blob],
              `paste-${Date.now()}.${type.split("/")[1] || "png"}`,
              { type },
            );
            await addImageFiles([file]);
            return;
          }
        }
      } catch {
        /* NotAllowedError / unsupported — fall through */
      }
      await tryNativeClipboardImage();
    })();
  };

  const removeQueuedPrompt = (sessionId: string, queueId: string) => {
    patchSession(sessionId, (s) => ({
      ...s,
      promptQueue: (s.promptQueue ?? []).filter((q) => q.id !== queueId),
    }));
  };

  /** Run one prompt turn (must not be called while this session is already in flight). */
  const runPrompt = async (
    sessionId: string,
    opts: {
      text: string;
      displayText: string;
      images: { mimeType: string; data: string; name: string }[];
      /** Clear review comments when starting (immediate send from composer). */
      clearReviewComments?: boolean;
      titleHint?: string;
    },
  ) => {
    if (inFlightRef.current.has(sessionId)) return;
    inFlightRef.current.add(sessionId);

    const { text, displayText, images, clearReviewComments, titleHint } = opts;
    setError(null);
    const buf = ensureBuf(sessionId);
    buf.assistant = "";
    buf.thought = "";
    buf.user = text;
    buf.aId = null;
    buf.tId = null;
    const userMsgId = uid();
    buf.uId = userMsgId;
    buf.userTurnOpen = true;

    cancelRequested.current.delete(sessionId);
    lastActivityRef.current[sessionId] = Date.now();
    // Follow the new turn at the bottom so send feels responsive.
    setStuckToBottom(sessionId, true);

    patchSession(sessionId, (s) => ({
      ...s,
      busy: true,
      lastActivityAt: Date.now(),
      reviewComments: clearReviewComments ? [] : s.reviewComments,
      items: [
        ...s.items,
        {
          id: userMsgId,
          role: "user",
          text: displayText || text,
        },
      ],
      title:
        titleHint &&
        isGenericTitle(s.title, s.cwd) &&
        titleHint.length > 0 &&
        titleHint.length < 60
          ? titleHint
          : s.title,
    }));
    requestAnimationFrame(() => scrollToLatest(sessionId, "auto"));

    try {
      let result: Record<string, unknown>;
      if (images.length > 0) {
        result = await invoke<Record<string, unknown>>(
          "session_prompt_with_images",
          {
            sessionId,
            text: text || "See attached image(s).",
            images: images.map((img) => ({
              mimeType: img.mimeType,
              data: img.data,
              name: img.name,
            })),
          },
        );
      } else {
        result = await invoke<Record<string, unknown>>("session_prompt", {
          sessionId,
          text,
        });
      }
      const wasCancelled = cancelRequested.current.has(sessionId);
      cancelRequested.current.delete(sessionId);
      const meta = (result?._meta ?? result) as
        | Record<string, unknown>
        | undefined;
      const out =
        typeof meta?.outputTokens === "number"
          ? ` · ${meta.outputTokens} out`
          : "";
      const model =
        typeof meta?.modelId === "string" ? ` · ${meta.modelId}` : "";
      const b = ensureBuf(sessionId);
      b.assistant = "";
      b.thought = "";
      b.user = "";
      b.aId = null;
      b.tId = null;
      b.uId = null;
      b.userTurnOpen = false;

      const doneLabel = wasCancelled
        ? `Turn ended after stop${model}${out}`
        : `Turn complete${model}${out}`;
      patchSession(sessionId, (s) => ({
        ...s,
        busy: false,
        items: [
          ...s.items,
          {
            id: uid(),
            role: "system",
            text: doneLabel,
            meta: "stop",
          },
        ],
      }));
      if (!wasCancelled && sessionId !== activeIdRef.current) {
        const title =
          sessionsRef.current.find((s) => s.sessionId === sessionId)?.title ||
          shortId(sessionId);
        notifyOs("Grok Desk · turn complete", title);
      }
      await refreshDisk();
      const cwd = sessionsRef.current.find((s) => s.sessionId === sessionId)
        ?.cwd;
      if (cwd) void refreshGit(cwd, gitSelectedRef.current);
    } catch (e) {
      const msg = String(e);
      const wasCancelled = cancelRequested.current.has(sessionId);
      cancelRequested.current.delete(sessionId);
      if (!wasCancelled) {
        const timedOut =
          msg.toLowerCase().includes("timed out") ||
          msg.toLowerCase().includes("timeout");
        setError(
          timedOut
            ? "UI stopped waiting on this turn. The agent may still have written files — check Diff / git status, then resume or Stop."
            : msg,
        );
        if (timedOut) {
          patchSession(sessionId, (s) => ({
            ...s,
            busy: false,
            items: [
              ...s.items,
              {
                id: uid(),
                role: "system",
                text: "Turn wait ended (timeout). Diff auto-refreshed — verify disk before re-running the same plan.",
                meta: "stop",
              },
            ],
          }));
        } else {
          patchSession(sessionId, (s) => ({ ...s, busy: false }));
        }
      } else {
        patchSession(sessionId, (s) => ({ ...s, busy: false }));
      }
      const cwd = sessionsRef.current.find(
        (s) => s.sessionId === sessionId,
      )?.cwd;
      if (cwd) void refreshGit(cwd, gitSelectedRef.current);
    } finally {
      inFlightRef.current.delete(sessionId);
      // Drain queue after this turn fully settles.
      void drainPromptQueue(sessionId);
    }
  };

  const drainPromptQueue = async (sessionId: string) => {
    if (inFlightRef.current.has(sessionId)) return;
    const sess = sessionsRef.current.find((s) => s.sessionId === sessionId);
    const next = sess?.promptQueue?.[0];
    if (!next) return;

    // Pop head of queue, then run.
    patchSession(sessionId, (s) => {
      const remaining = Math.max(0, (s.promptQueue?.length ?? 1) - 1);
      return {
        ...s,
        promptQueue: (s.promptQueue ?? []).slice(1),
        items: [
          ...s.items,
          {
            id: uid(),
            role: "system",
            text:
              remaining > 0
                ? `Running queued prompt (${remaining} still queued)…`
                : "Running queued prompt…",
            meta: "queue",
          },
        ],
      };
    });

    await runPrompt(sessionId, {
      text: next.text,
      displayText: next.displayText,
      images: next.images,
      clearReviewComments: false,
    });
  };

  const send = async () => {
    if (!active) return;
    if (!prompt.trim() && pendingImages.length === 0) return;

    const userText = prompt.trim();
    let text = userText;
    const sessionId = active.sessionId;
    // Only attach open review comments on an immediate (non-queued) send.
    const willRunNow =
      !active.busy && !inFlightRef.current.has(sessionId);
    const comments =
      willRunNow && (active.reviewComments?.length ?? 0) > 0
        ? active.reviewComments
        : [];
    const images = [...pendingImages];
    if (comments.length > 0) {
      const block = comments
        .map((c) => {
          const loc =
            c.startLine != null ? `${c.path}:${c.startLine}` : c.path;
          const snip = c.snippet ? `\n  > ${c.snippet}` : "";
          return `- ${loc}: ${c.body}${snip}`;
        })
        .join("\n");
      text = `${text || "Please address the review comments."}\n\n## Review comments (apply these fixes)\n${block}`;
    }

    const displayBits = [
      userText || (images.length ? "[image]" : ""),
      comments.length
        ? `(${comments.length} review note${comments.length === 1 ? "" : "s"})`
        : "",
      images.length
        ? `(${images.length} image${images.length === 1 ? "" : "s"})`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");

    setPrompt("");
    setPendingImages([]);

    if (!willRunNow) {
      const queued: QueuedPrompt = {
        id: uid(),
        text,
        displayText: displayBits || userText || text,
        images: images.map((img) => ({
          mimeType: img.mimeType,
          data: img.data,
          name: img.name,
        })),
      };
      patchSession(sessionId, (s) => ({
        ...s,
        promptQueue: [...(s.promptQueue ?? []), queued],
        items: [
          ...s.items,
          {
            id: uid(),
            role: "system",
            text: `Queued: ${queued.displayText}`,
            meta: "queue",
          },
        ],
      }));
      return;
    }

    await runPrompt(sessionId, {
      text,
      displayText: displayBits || userText || text,
      images: images.map((img) => ({
        mimeType: img.mimeType,
        data: img.data,
        name: img.name,
      })),
      clearReviewComments: true,
      titleHint: userText,
    });
  };

  /** Send pending review notes only (no free-text message required). */
  const sendReviewNotes = async () => {
    if (!active) return;
    const comments = active.reviewComments ?? [];
    if (comments.length === 0) return;

    const sessionId = active.sessionId;
    const willRunNow =
      !active.busy && !inFlightRef.current.has(sessionId);
    const block = comments
      .map((c) => {
        const loc =
          c.startLine != null ? `${c.path}:${c.startLine}` : c.path;
        const snip = c.snippet ? `\n  > ${c.snippet}` : "";
        return `- ${loc}: ${c.body}${snip}`;
      })
      .join("\n");
    const text = `Please address the review comments.\n\n## Review comments (apply these fixes)\n${block}`;
    const displayText = `Review notes (${comments.length})`;

    if (!willRunNow) {
      const queued: QueuedPrompt = {
        id: uid(),
        text,
        displayText,
        images: [],
      };
      patchSession(sessionId, (s) => ({
        ...s,
        reviewComments: [],
        promptQueue: [...(s.promptQueue ?? []), queued],
        items: [
          ...s.items,
          {
            id: uid(),
            role: "system",
            text: `Queued: ${displayText}`,
            meta: "queue",
          },
        ],
      }));
      return;
    }

    await runPrompt(sessionId, {
      text,
      displayText,
      images: [],
      clearReviewComments: true,
      titleHint: "Review notes",
    });
  };

  /** Put a past user message back into the composer for edit/resend. */
  const retryUserPrompt = (text: string) => {
    if (!active) return;
    saveDraft(active.sessionId);
    setPrompt(text);
    setComposerCursor(text.length);
    setSlashDismissed(false);
    focusComposer();
  };

  const cancel = async () => {
    if (!active) return;
    const sessionId = active.sessionId;
    cancelRequested.current.add(sessionId);
    try {
      await invoke("session_cancel", { sessionId });
      // Unlock UI immediately — agent may still wind down the current tool.
      patchSession(sessionId, (s) => ({
        ...s,
        busy: false,
        items: [
          ...s.items,
          {
            id: uid(),
            role: "system",
            text: "Stop requested — UI unlocked. Wait a moment before sending again if tools are still finishing.",
            meta: "stop",
          },
        ],
      }));
    } catch (e) {
      setError(String(e));
      // Still unlock so the user is never stuck behind a hung prompt RPC.
      patchSession(sessionId, (s) => ({ ...s, busy: false }));
    }
  };

  /** Force-clear busy without talking to the agent (last-resort stall recovery). */
  const unlockUi = (sessionId: string) => {
    cancelRequested.current.add(sessionId);
    patchSession(sessionId, (s) => ({
      ...s,
      busy: false,
      items: [
        ...s.items,
        {
          id: uid(),
          role: "system",
          text: "UI unlocked. If the agent is still working, use Stop or Disconnect, or wait for the turn to finish.",
          meta: "stop",
        },
      ],
    }));
  };

  const applyModelSettings = async (
    sessionId: string,
    modelId: string,
    reasoningEffort?: string | null,
  ) => {
    setError(null);
    try {
      const result = await invoke<SessionInfo>("session_set_model", {
        sessionId,
        modelId,
        reasoningEffort: reasoningEffort || null,
      });
      patchSession(sessionId, (s) => ({
        ...s,
        modelId: result.modelId ?? modelId,
        reasoningEffort:
          result.reasoningEffort ?? reasoningEffort ?? s.reasoningEffort,
        availableModels:
          result.availableModels?.length
            ? result.availableModels
            : s.availableModels,
        items: [
          ...s.items,
          {
            id: uid(),
            role: "system",
            text: `Model → ${result.modelId ?? modelId}${
              reasoningEffort ? ` · effort ${reasoningEffort}` : ""
            }`,
            meta: "config",
          },
        ],
      }));
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              modelId: result.modelId ?? prev.modelId,
              reasoningEffort:
                result.reasoningEffort ?? prev.reasoningEffort,
            }
          : prev,
      );
    } catch (e) {
      setError(String(e));
    }
  };

  const setPermissionMode = (sessionId: string, mode: PermissionMode) => {
    patchSession(sessionId, (s) => ({
      ...s,
      permissionMode: mode,
      items: [
        ...s.items,
        {
          id: uid(),
          role: "system",
          text:
            mode === "always-approve"
              ? "Permission mode → always-approve (auto-allow tool prompts for this tab)"
              : "Permission mode → ask (show permission cards)",
          meta: "config",
        },
      ],
    }));
  };

  const respondPermission = async (
    sessionId: string,
    requestId: number,
    optionId: string | null,
  ) => {
    try {
      await invoke("permission_respond", { requestId, optionId });
      patchSession(sessionId, (s) => ({
        ...s,
        permissions: s.permissions.filter((p) => p.requestId !== requestId),
      }));
    } catch (e) {
      setError(String(e));
    }
  };

  /** Inject a system-steering prompt into the active session. */
  const steer = async (text: string) => {
    if (!active || active.busy) return;
    setPrompt("");
    const sessionId = active.sessionId;
    const buf = ensureBuf(sessionId);
    buf.assistant = "";
    buf.thought = "";
    buf.user = text;
    buf.aId = null;
    buf.tId = null;
    const userMsgId = uid();
    buf.uId = userMsgId;
    buf.userTurnOpen = true;
    patchSession(sessionId, (s) => ({
      ...s,
      busy: true,
      items: [...s.items, { id: userMsgId, role: "user", text }],
    }));
    try {
      await invoke("session_prompt", { sessionId, text });
      const b = ensureBuf(sessionId);
      b.assistant = "";
      b.thought = "";
      b.user = "";
      b.aId = null;
      b.tId = null;
      b.uId = null;
      b.userTurnOpen = false;
      patchSession(sessionId, (s) => ({
        ...s,
        busy: false,
        items: [
          ...s.items,
          { id: uid(), role: "system", text: "Turn complete", meta: "stop" },
        ],
      }));
    } catch (e) {
      setError(String(e));
      patchSession(sessionId, (s) => ({ ...s, busy: false }));
    }
  };

  const browseFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Open project folder",
        defaultPath: cwd || undefined,
      });
      if (typeof selected === "string" && selected.length > 0) {
        setCwd(selected);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const respondPlanApproval = async (
    sessionId: string,
    outcome: "approved" | "cancelled" | "abandoned",
    feedback?: string,
  ) => {
    const pending = planApprovalRef.current[sessionId];
    if (!pending) return;
    try {
      await invoke("plan_approval_respond", {
        requestId: pending.requestId,
        outcome,
        feedback: feedback ?? null,
      });
      delete planApprovalRef.current[sessionId];
      patchSession(sessionId, (s) => ({
        ...s,
        planApproval: null,
        modeId: outcome === "approved" ? "default" : s.modeId,
        items: [
          ...s.items,
          {
            id: uid(),
            role: "system",
            text:
              outcome === "approved"
                ? "Plan approved — agent will implement."
                : outcome === "abandoned"
                  ? "Plan abandoned."
                  : `Plan revision requested${feedback ? `: ${feedback}` : ""}.`,
          },
        ],
      }));
    } catch (e) {
      setError(String(e));
    }
  };

  const enterPlanMode = () => {
    const goal = prompt.trim();
    if (!goal) {
      setError(
        "Type your goal in the message box first, then click Enter plan mode.",
      );
      return;
    }
    setError(null);
    void steer(
      `Enter plan mode for this goal:\n\n${goal}\n\n` +
        `Design a clear multi-step plan. Do not implement code yet — wait for my explicit approval. ` +
        `Use todos / plan entries I can track in the Plan pane. When done, call exit_plan_mode so I can approve.`,
    );
    setPrompt("");
  };

  const approvePlan = () => {
    if (!active) return;
    // Prefer real ACP handshake when the agent is waiting on exit_plan_mode
    if (active.planApproval) {
      void respondPlanApproval(active.sessionId, "approved");
      return;
    }
    // Fallback if agent never sent the reverse-request
    void steer(
      "Plan approved. Execute the plan step by step. " +
        "Update todo/plan status as you complete each step. Prefer small, verifiable diffs.",
    );
  };

  const revisePlan = () => {
    if (!active) return;
    if (active.planApproval) {
      const fb = prompt.trim() || "Please revise the plan based on my feedback.";
      void respondPlanApproval(active.sessionId, "cancelled", fb);
      setPrompt("");
      return;
    }
    setPrompt("Please revise the plan: ");
  };

  const abandonPlan = () => {
    if (!active?.planApproval) return;
    void respondPlanApproval(active.sessionId, "abandoned");
  };

  const refreshPlanDoc = async () => {
    if (!active) return;
    try {
      const doc = await invoke<string | null>("read_plan_doc", {
        sessionId: active.sessionId,
        cwd: active.cwd,
      });
      patchSession(active.sessionId, (s) => ({
        ...s,
        planDoc: doc ?? null,
      }));
    } catch (e) {
      setError(String(e));
    }
  };

  const selectGitFile = async (path: string) => {
    if (!active) return;
    await selectGitFileAt(active.cwd, path);
  };

  // Refresh git when switching sessions
  useEffect(() => {
    if (active?.cwd) void refreshGit(active.cwd);
  }, [active?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const stallSeconds = useMemo(() => {
    if (!active?.busy) return 0;
    const last =
      lastActivityRef.current[active.sessionId] ?? active.lastActivityAt ?? 0;
    if (!last) return 0;
    return Math.max(0, Math.floor((clock - last) / 1000));
  }, [active?.busy, active?.sessionId, active?.lastActivityAt, clock]);

  const isStalled = Boolean(
    active?.busy &&
      stallSeconds * 1000 >= STALL_MS &&
      active.permissions.length === 0 &&
      !active.planApproval,
  );

  const headerStatus = useMemo(() => {
    if (!grok?.available) return "Grok CLI missing";
    if (!running) return "Disconnected";
    if (!active) return "Connected · no session";
    if (active.permissions.length > 0) return "Needs permission";
    if (active.planApproval) return "Plan ready";
    if (isStalled) return `Quiet ${stallSeconds}s…`;
    return active.busy ? "Running…" : "Ready";
  }, [grok, running, active, isStalled, stallSeconds]);

  /** Screen-reader announcement for busy → ready / permission (polite). */
  const liveStatus = useMemo(() => {
    if (!active) return "";
    if (active.permissions.length > 0) {
      return "Permission required — review tool request";
    }
    if (active.planApproval) return "Plan ready for approval";
    if (isStalled) return `Agent quiet for ${stallSeconds} seconds`;
    if (active.busy) return "Agent running";
    return "Ready";
  }, [active, isStalled, stallSeconds]);

  const sessionModels: ModelOption[] = useMemo(() => {
    if (active?.availableModels?.length) return active.availableModels;
    if (info?.availableModels?.length) return info.availableModels;
    if (active?.modelId) {
      return [
        {
          modelId: active.modelId,
          name: active.modelId,
          supportsReasoningEffort: true,
          reasoningEfforts: [...DEFAULT_EFFORTS],
        },
      ];
    }
    return [];
  }, [active?.availableModels, active?.modelId, info?.availableModels]);

  const effortOptions = useMemo(() => {
    const mid = active?.modelId;
    const m = sessionModels.find((x) => x.modelId === mid) ?? sessionModels[0];
    if (m?.reasoningEfforts?.length) return m.reasoningEfforts;
    return DEFAULT_EFFORTS.map((e) => ({ ...e, description: null as string | null }));
  }, [active?.modelId, sessionModels]);

  const supportsEffort = useMemo(() => {
    const mid = active?.modelId;
    const m = sessionModels.find((x) => x.modelId === mid) ?? sessionModels[0];
    return Boolean(
      m?.supportsReasoningEffort || (m?.reasoningEfforts?.length ?? 0) > 0,
    );
  }, [active?.modelId, sessionModels]);

  const planDone = active?.plan.filter((e) => e.status === "completed").length ?? 0;
  const planTotal = active?.plan.length ?? 0;
  const planBadge =
    planTotal > 0 ? `${planDone}/${planTotal}` : active?.planApproval ? "!" : null;
  const diffBadge =
    gitFiles.length > 0
      ? String(gitFiles.length)
      : (active?.reviewComments?.length ?? 0) > 0
        ? String(active!.reviewComments.length)
        : null;
  const subRunning = active
    ? countRunningSubagents(active.subagents ?? [])
    : 0;
  const bgRunning = active
    ? countRunningBackground(active.backgroundTasks ?? [])
    : 0;
  const activityLive = active
    ? countRunningTools(active.tools) + bgRunning + subRunning
    : 0;
  const activityBadge =
    activityLive > 0 ? String(activityLive) : active?.busy ? "…" : null;
  const watching =
    !!active &&
    (subRunning > 0 || bgRunning > 0) &&
    (!active.busy || subRunning > 0 || bgRunning > 0);
  // stickTick forces re-render when the user pins/unpins auto-scroll.
  const showJumpToLatest =
    !!active && stickTick >= 0 && !isStuckToBottom(active.sessionId);

  /** Transcript + composer grow when rails free space. */
  const chatMaxClass = useMemo(
    () =>
      chatContentMaxClass({
        sidebarCollapsed,
        inspectorOpen: inspectorTab != null,
      }),
    [sidebarCollapsed, inspectorTab],
  );

  const slashMatch = useMemo(
    () => getSlashMatch(prompt, composerCursor),
    [prompt, composerCursor],
  );
  const slashCommands = active?.availableCommands ?? [];
  const slashFiltered = useMemo(
    () =>
      slashMatch ? filterCommands(slashCommands, slashMatch.query) : [],
    [slashMatch, slashCommands],
  );
  const slashOpen = Boolean(active && slashMatch && !slashDismissed);

  // Re-show palette when the /token changes after Esc
  useEffect(() => {
    setSlashDismissed(false);
    setSlashIndex(0);
  }, [slashMatch?.start, slashMatch?.query]);

  // Keep selection in range when filter changes
  useEffect(() => {
    if (slashIndex >= slashFiltered.length) {
      setSlashIndex(Math.max(0, slashFiltered.length - 1));
    }
  }, [slashFiltered.length, slashIndex]);

  const applySlashCommand = useCallback(
    (cmd: AvailableCommand) => {
      const match = getSlashMatch(
        prompt,
        composerRef.current?.selectionStart ?? composerCursor,
      );
      const insert = `/${cmd.name} `;
      if (!match) {
        const next =
          prompt + (prompt && !/\s$/.test(prompt) ? " " : "") + insert;
        setPrompt(next);
        setSlashDismissed(true);
        setSlashIndex(0);
        requestAnimationFrame(() => {
          const el = composerRef.current;
          if (!el) return;
          const pos = next.length;
          el.focus();
          el.setSelectionRange(pos, pos);
          setComposerCursor(pos);
        });
        return;
      }
      const next =
        prompt.slice(0, match.start) + insert + prompt.slice(match.end);
      setPrompt(next);
      setSlashDismissed(true);
      setSlashIndex(0);
      requestAnimationFrame(() => {
        const el = composerRef.current;
        if (!el) return;
        const pos = match.start + insert.length;
        el.focus();
        el.setSelectionRange(pos, pos);
        setComposerCursor(pos);
      });
    },
    [prompt, composerCursor],
  );

  const paletteCommands = useMemo((): PaletteCommand[] => {
    const cmds: PaletteCommand[] = [
      {
        id: "connect",
        label: running ? "Disconnect from Grok" : "Connect to Grok",
        group: "Agent",
        shortcut: undefined,
        enabled: running || !!grok?.available,
        run: () => {
          if (running) void disconnect();
          else void connect();
        },
      },
      {
        id: "new-session",
        label: "New session",
        detail: cwd || "Pick a project folder first",
        group: "Sessions",
        shortcut: "Ctrl+N",
        enabled: !!cwd,
        run: () => void openSession(),
      },
      {
        id: "focus-composer",
        label: "Focus composer",
        group: "Sessions",
        shortcut: "Ctrl+L",
        enabled: !!active,
        run: () => focusComposer(),
      },
      {
        id: "toggle-plan",
        label: "Toggle Plan panel",
        group: "Panels",
        shortcut: "Alt+P",
        enabled: !!active,
        run: () => setInspectorTab((t) => (t === "plan" ? null : "plan")),
      },
      {
        id: "toggle-diff",
        label: "Toggle Diff panel",
        group: "Panels",
        shortcut: "Alt+D",
        enabled: !!active,
        run: () => setInspectorTab((t) => (t === "diff" ? null : "diff")),
      },
      {
        id: "toggle-activity",
        label: "Toggle Activity panel",
        group: "Panels",
        shortcut: "Alt+A",
        enabled: !!active,
        run: () =>
          setInspectorTab((t) => (t === "activity" ? null : "activity")),
      },
      {
        id: "toggle-settings",
        label: "Toggle Settings",
        group: "Panels",
        shortcut: "Alt+,",
        enabled: !!active,
        run: () =>
          setInspectorTab((t) => (t === "settings" ? null : "settings")),
      },
      {
        id: "toggle-terminal",
        label: terminalOpen ? "Hide terminal" : "Show terminal",
        detail: "Project shell in session cwd (human PTY)",
        group: "Panels",
        shortcut: "Ctrl+`",
        enabled: !!active,
        run: () => {
          setTerminalOpen((v) => !v);
          if (terminalOpen) setTerminalFocused(false);
        },
      },
      {
        id: "toggle-file-tree",
        label: fileTreeOpen ? "Hide file tree" : "Show file tree",
        detail: "Browse project · open files externally",
        group: "Panels",
        shortcut: "Alt+F",
        enabled: !!active,
        run: () => toggleFileTree(),
      },
      {
        id: "restart-shell",
        label: "Restart project shell",
        detail: active?.cwd || undefined,
        group: "Panels",
        enabled: !!active && terminalOpen,
        run: async () => {
          if (!active) return;
          setTerminalOpen(true);
          try {
            await invoke("pty_kill_session", { sessionId: active.sessionId });
          } catch {
            /* ignore */
          }
          setShellEpoch((n) => n + 1);
        },
      },
      {
        id: "toggle-sidebar",
        label: sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
        group: "Panels",
        shortcut: "Ctrl+B",
        run: () => setSidebarCollapsed((v) => !v),
      },
      {
        id: "browse-folder",
        label: "Choose project folder…",
        group: "Sessions",
        run: () => void browseFolder(),
      },
      {
        id: "toggle-recents",
        label: showRecents ? "Hide recents" : "Show recents",
        group: "Sessions",
        run: () => {
          setShowRecents((v) => !v);
          if (sidebarCollapsed) setSidebarCollapsed(false);
          void refreshDisk();
        },
      },
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        group: "Help",
        shortcut: "Ctrl+/",
        run: () => setShowShortcuts(true),
      },
    ];

    for (const s of sessions) {
      cmds.push({
        id: `session:${s.sessionId}`,
        label: s.title || folderName(s.cwd),
        detail: `${folderName(s.cwd)} · ${shortId(s.sessionId)}${s.busy ? " · busy" : ""}`,
        group: "Open sessions",
        run: () => selectSession(s.sessionId, s.cwd),
      });
    }

    for (const p of pins.filter((x) => !x.missing).slice(0, 12)) {
      const open = sessions.some((s) => s.sessionId === p.sessionId);
      cmds.push({
        id: `pin:${p.sessionId}`,
        label: p.title || folderName(p.cwd),
        detail: open
          ? `Pinned · open · ${folderName(p.cwd)}`
          : `Pinned · ${folderName(p.cwd)}`,
        group: "Pins",
        run: () => {
          if (open) selectSession(p.sessionId, p.cwd);
          else
            void resumeSession(
              {
                sessionId: p.sessionId,
                cwd: p.cwd,
                title: p.title,
              },
              { activate: true },
            );
        },
      });
    }

    for (const d of diskSessions.slice(0, 10)) {
      const open = sessions.some((s) => s.sessionId === d.sessionId);
      if (open) continue;
      cmds.push({
        id: `recent:${d.sessionId}`,
        label: d.title || folderName(d.cwd),
        detail: `Recent · ${folderName(d.cwd)} · ${shortId(d.sessionId)}`,
        group: "Recents",
        enabled: running,
        run: () => void resumeDisk(d),
      });
    }

    if (active) {
      const pinned = isPinned(active.sessionId, active.cwd);
      cmds.push({
        id: "pin-active",
        label: pinned ? "Unpin current session" : "Pin current session",
        group: "Sessions",
        run: () => {
          if (pinned) void unpinSession(active.sessionId, active.cwd);
          else void pinSession(active.sessionId, active.cwd, active.title);
        },
      });
      cmds.push({
        id: "enter-plan-mode",
        label: "Enter plan mode",
        detail: "Agent plans before implementing",
        group: "Agent",
        enabled: !active.busy,
        run: () => {
          setInspectorTab("plan");
          enterPlanMode();
        },
      });
      cmds.push({
        id: "perm-ask",
        label: "Permission mode: Ask",
        detail: "Prompt for tool approvals",
        group: "Sessions",
        enabled: (active.permissionMode ?? "default") !== "default",
        run: () => setPermissionMode(active.sessionId, "default"),
      });
      cmds.push({
        id: "perm-always",
        label: "Permission mode: Always approve",
        detail: "Auto-allow tools for this tab",
        group: "Sessions",
        enabled: active.permissionMode !== "always-approve",
        run: () => setPermissionMode(active.sessionId, "always-approve"),
      });
      cmds.push({
        id: "open-project-folder",
        label: "Open project folder…",
        detail: active.cwd,
        group: "Project",
        run: () => {
          void openPath(active.cwd).catch((e) =>
            setError(`Open folder failed: ${e}`),
          );
        },
      });
      cmds.push({
        id: "copy-session-id",
        label: "Copy session ID",
        detail: active.sessionId,
        group: "Sessions",
        run: () => {
          void navigator.clipboard.writeText(active.sessionId).catch(() => {
            setError("Clipboard write failed");
          });
        },
      });
      if (active.planApproval) {
        cmds.push({
          id: "approve-plan",
          label: "Approve plan & run",
          group: "Agent",
          run: () => approvePlan(),
        });
        cmds.push({
          id: "revise-plan",
          label: "Request plan changes",
          group: "Agent",
          run: () => revisePlan(),
        });
      }
    }

    return cmds;
  }, [
    running,
    grok?.available,
    cwd,
    active,
    sessions,
    pins,
    diskSessions,
    sidebarCollapsed,
    showRecents,
    selectSession,
    focusComposer,
    isPinned,
    terminalOpen,
    fileTreeOpen,
    toggleFileTree,
  ]);

  return (
    <div className="flex h-full flex-col">
      <Titlebar
        running={running}
        headerStatus={headerStatus}
        activeBusy={active?.busy}
        activePermissionCount={active?.permissions.length}
        tierLabel={info?.subscriptionTier}
        appVersion={appVersion}
        updateAvailable={!!updateCheck?.updateAvailable && !updateBannerDismissed}
        onShowShortcuts={() => setShowShortcuts(true)}
        onOpenUpdates={() => {
          setInspectorTab("settings");
          setUpdateBannerDismissed(false);
        }}
      />
      {(updateCheck?.updateAvailable ||
        updatePhase === "running" ||
        updatePhase === "ready" ||
        updatePhase === "failed") &&
        !updateBannerDismissed && (
          <UpdateBanner
            update={
              updateCheck ?? {
                updateAvailable: false,
                currentCommit: appVersion?.commit ?? "",
                currentCommitShort: appVersion?.commitShort ?? "",
                githubRepo: "criptocbas/grok-desk",
                githubBranch: "main",
                canAutoUpdate: !!appVersion?.repoPath,
              }
            }
            phase={updatePhase}
            onUpdate={() => void startAppUpdate()}
            onRestart={() => void restartApp()}
            onDismiss={() => setUpdateBannerDismissed(true)}
            onOpenSettings={() => setInspectorTab("settings")}
          />
        )}

      <div className="flex min-h-0 flex-1">
        <LeftNavigator
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          running={running}
          connecting={connecting}
          grokAvailable={!!grok?.available}
          headerStatus={headerStatus}
          cwd={cwd}
          onCwdChange={setCwd}
          onBrowseFolder={() => void browseFolder()}
          onConnect={() => void connect()}
          onDisconnect={() => void disconnect()}
          onOpenSession={() => void openSession()}
          sessions={sessions}
          activeId={activeId}
          onSelectSession={selectSession}
          onCloseSession={closeSession}
          pins={pins}
          resumingPins={resumingPins}
          isPinned={isPinned}
          onPin={(sessionId, sessionCwd, title) =>
            void pinSession(sessionId, sessionCwd, title)
          }
          onUnpin={(sessionId, sessionCwd) =>
            void unpinSession(sessionId, sessionCwd)
          }
          onResumePin={(p) =>
            void resumeSession(
              {
                sessionId: p.sessionId,
                cwd: p.cwd,
                title: p.title,
              },
              { activate: true },
            )
          }
          onReorderPins={(ids) => void reorderPins(ids)}
          onRenameSession={(sessionId, title) =>
            void renameSession(sessionId, title)
          }
          groups={sessionGroups.groups}
          groupMembership={sessionGroups.membership}
          onCreateGroup={(name) => void createGroup(name)}
          onRenameGroup={(id, name) => void renameGroup(id, name)}
          onDeleteGroup={(id) => void deleteGroup(id)}
          onSetGroupCollapsed={(id, collapsed) =>
            void setGroupCollapsed(id, collapsed)
          }
          onSetSessionGroup={(sessionId, groupId) =>
            void setSessionGroup(sessionId, groupId)
          }
          onSetGroupPinned={(groupId, pinned) =>
            void setGroupPinned(groupId, pinned)
          }
          showRecents={showRecents}
          onToggleRecents={() => {
            setShowRecents((v) => !v);
            if (sidebarCollapsed) setSidebarCollapsed(false);
            void refreshDisk();
          }}
          diskSessions={diskSessions}
          onResumeDisk={(d) => void resumeDisk(d)}
          stderrTail={stderrTail}
          active={active}
        />

        <div className="flex min-w-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            {sessions.length > 0 && (
              <SessionTabStrip
                sessions={sessions}
                activeId={activeId}
                onSelect={selectSession}
                onClose={closeSession}
                onNewSession={() => void openSession()}
                canNewSession={!!cwd}
              />
            )}
            {active ? (
              <div className="flex min-h-0 min-w-0 flex-1">
                <FileTreePane
                  root={active.cwd}
                  open={fileTreeOpen}
                  onClose={() => {
                    closeFileTree();
                  }}
                />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <SessionChrome
                    session={active}
                    isPinned={isPinned(active.sessionId, active.cwd)}
                    sessionModels={sessionModels}
                    supportsEffort={supportsEffort}
                    effortOptions={effortOptions}
                    infoModelId={info?.modelId}
                    infoEffort={info?.reasoningEffort}
                    planBadge={planBadge}
                    diffBadge={diffBadge}
                    inspectorTab={inspectorTab}
                    gitFileCount={gitFiles.length}
                    onPinToggle={() => {
                      if (isPinned(active.sessionId, active.cwd)) {
                        void unpinSession(active.sessionId, active.cwd);
                      } else {
                        void pinSession(
                          active.sessionId,
                          active.cwd,
                          active.title,
                        );
                      }
                    }}
                    onRename={(title) =>
                      void renameSession(active.sessionId, title)
                    }
                    onApplyModel={(sessionId, modelId, effort) =>
                      void applyModelSettings(sessionId, modelId, effort)
                    }
                    onPermissionMode={setPermissionMode}
                    onInspectorTab={setInspectorTab}
                    fileTreeOpen={fileTreeOpen}
                    onToggleFileTree={toggleFileTree}
                  />

                  {isStalled && (
                    <StallBanner
                      stallSeconds={stallSeconds}
                      onStop={() => void cancel()}
                      onUnlock={() => unlockUi(active.sessionId)}
                      onRefreshDiffs={() =>
                        void refreshGit(active.cwd, gitSelected)
                      }
                    />
                  )}

                  <PermissionBanner
                    permissions={active.permissions}
                    sessionId={active.sessionId}
                    onRespond={respondPermission}
                  />

                  <div className="relative min-h-0 flex-1">
                    <div
                      ref={scrollRef}
                      onScroll={onTranscriptScroll}
                      className={`h-full overflow-y-auto py-4 ${
                        sidebarCollapsed && !inspectorTab && !fileTreeOpen
                          ? "px-6"
                          : "px-4"
                      }`}
                    >
                      <TranscriptList
                        items={active.items}
                        contentMaxClass={chatMaxClass}
                        onOpenActivity={() => setInspectorTab("activity")}
                        onRetryUser={retryUserPrompt}
                      />
                    </div>
                    {showJumpToLatest && (
                      <button
                        type="button"
                        onClick={() => scrollToLatest(active.sessionId)}
                        className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] font-medium text-[var(--text)] shadow-[var(--shadow-panel)] hover:border-[var(--accent)]"
                      >
                        Jump to latest
                        {active.busy ? " · streaming" : ""}
                      </button>
                    )}
                  </div>

                  {/* Polite live region for turn / permission state (screen readers). */}
                  <div className="sr-only" aria-live="polite" aria-atomic="true">
                    {liveStatus}
                  </div>

                  {error && (
                    <div className="border-t border-[var(--danger)]/40 bg-[var(--bg-danger-subtle)] px-4 py-2 text-xs text-[var(--danger)]">
                      {error}
                    </div>
                  )}

                  {watching && (
                    <WatchingBanner
                      subagentCount={subRunning}
                      backgroundCount={bgRunning}
                      onOpenActivity={() => setInspectorTab("activity")}
                    />
                  )}

                  <Composer
                    busy={active.busy}
                    prompt={prompt}
                    contentMaxClass={chatMaxClass}
                    onPromptChange={(value, cursor) => {
                      setPrompt(value);
                      setComposerCursor(cursor);
                    }}
                    onCursor={setComposerCursor}
                    composerRef={composerRef}
                    pendingImages={pendingImages}
                    onRemoveImage={(id) =>
                      setPendingImages((prev) =>
                        prev.filter((p) => p.id !== id),
                      )
                    }
                    onPaste={onComposerPaste}
                    onAttachImages={(files) => void addImageFiles(files)}
                    promptQueue={active.promptQueue ?? []}
                    onClearQueue={() =>
                      patchSession(active.sessionId, (s) => ({
                        ...s,
                        promptQueue: [],
                        items: [
                          ...s.items,
                          {
                            id: uid(),
                            role: "system",
                            text: "Prompt queue cleared.",
                            meta: "queue",
                          },
                        ],
                      }))
                    }
                    onRemoveQueued={(id) =>
                      removeQueuedPrompt(active.sessionId, id)
                    }
                    availableCommands={active.availableCommands ?? []}
                    slashOpen={slashOpen}
                    slashCommands={slashCommands}
                    slashMatch={slashMatch}
                    slashIndex={slashIndex}
                    onSlashIndex={setSlashIndex}
                    onPickSlash={applySlashCommand}
                    onDismissSlash={() => {
                      setSlashDismissed(true);
                      setSlashIndex(0);
                    }}
                    slashDismissed={slashDismissed}
                    onUndismissSlash={() => setSlashDismissed(false)}
                    onSend={() => void send()}
                    onCancel={() => void cancel()}
                    context={{
                      modeId: active.modeId,
                      permissionMode: active.permissionMode ?? "default",
                      modelLabel: (() => {
                        const mid = active.modelId ?? info?.modelId;
                        if (!mid) return null;
                        const m = sessionModels.find((x) => x.modelId === mid);
                        return m?.name || mid;
                      })(),
                      effortLabel: supportsEffort
                        ? active.reasoningEffort ??
                          info?.reasoningEffort ??
                          null
                        : null,
                      reviewNoteCount: active.reviewComments?.length ?? 0,
                      busy: active.busy,
                      onOpenDiff: () => setInspectorTab("diff"),
                      onOpenPlan: () => setInspectorTab("plan"),
                      onSendReviewNotes: () => void sendReviewNotes(),
                    }}
                  />

                  <TerminalDock
                    key={`${active.sessionId}:${shellEpoch}`}
                    sessionId={active.sessionId}
                    cwd={active.cwd}
                    open={terminalOpen}
                    onOpenChange={setTerminalOpen}
                    onTerminalFocusChange={setTerminalFocused}
                  />
                </div>
              </div>
            ) : (
              <EmptyWorkbench
                running={running}
                connecting={connecting}
                grokAvailable={!!grok?.available}
                onConnect={() => void connect()}
                cwd={cwd}
                onNewSession={() => void openSession()}
                onBrowseFolder={() => void browseFolder()}
                pins={pins}
                onResumePin={(p) =>
                  void resumeSession(
                    {
                      sessionId: p.sessionId,
                      cwd: p.cwd,
                      title: p.title,
                    },
                    { activate: true },
                  )
                }
                diskSessions={diskSessions}
                onResumeDisk={(d) => void resumeDisk(d)}
              />
            )}
          </main>

          {active && (
            <InspectorRail
              tab={inspectorTab}
              onTab={setInspectorTab}
              planBadge={planBadge}
              planAlert={!!active.planApproval}
              diffBadge={diffBadge}
              activityBadge={activityBadge}
              activityAlert={activityLive > 0}
            >
              {inspectorTab === "plan" && (
                <PlanPane
                  embedded
                  plan={active.plan}
                  modeId={active.modeId}
                  planDoc={active.planDoc}
                  planApproval={active.planApproval}
                  busy={active.busy}
                  onEnterPlanMode={enterPlanMode}
                  onApprove={approvePlan}
                  onRevise={revisePlan}
                  onRefreshDoc={() => void refreshPlanDoc()}
                  onAbandonPlan={abandonPlan}
                />
              )}
              {inspectorTab === "diff" && (
                <DiffPane
                  embedded
                  isRepo={gitIsRepo}
                  files={gitFiles}
                  selectedPath={gitSelected}
                  patch={gitPatch}
                  error={gitError}
                  loading={gitLoading}
                  comments={active.reviewComments ?? []}
                  onSelectFile={(p) => void selectGitFile(p)}
                  onRefresh={() => void refreshGit(active.cwd, gitSelected)}
                  onAddComment={(c) => {
                    const comment: ReviewComment = { ...c, id: uid() };
                    patchSession(active.sessionId, (s) => ({
                      ...s,
                      reviewComments: [...(s.reviewComments ?? []), comment],
                    }));
                  }}
                  onRemoveComment={(id) => {
                    patchSession(active.sessionId, (s) => ({
                      ...s,
                      reviewComments: (s.reviewComments ?? []).filter(
                        (x) => x.id !== id,
                      ),
                    }));
                  }}
                />
              )}
              {inspectorTab === "activity" && (
                <ActivityPane
                  embedded
                  tools={active.tools}
                  backgroundTasks={active.backgroundTasks ?? []}
                  subagents={active.subagents ?? []}
                  busy={active.busy}
                />
              )}
              {inspectorTab === "settings" && (
                <SettingsPane
                  versionInfo={appVersion}
                  updateCheck={updateCheck}
                  updatePhase={updatePhase}
                  onCheckUpdates={() => void checkForUpdates()}
                  onStartUpdate={() => void startAppUpdate()}
                  onRestartApp={() => void restartApp()}
                  agentInfo={info}
                  grokStatus={grok}
                />
              )}
            </InspectorRail>
          )}
        </div>
      </div>

      <CommandPalette
        open={showPalette}
        commands={paletteCommands}
        onClose={() => setShowPalette(false)}
      />

      <ShortcutsHelp
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      <CoachMarks ready={running && sessions.length > 0} />
    </div>
  );
}
