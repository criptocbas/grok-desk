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
  GitFileStatus,
  GrokStatus,
  ModelOption,
  PermissionMode,
  PermissionRequest,
  PlanApprovalRequest,
  QueuedPrompt,
  ReviewComment,
  SessionInfo,
  SessionPin,
  SessionGroupsState,
  GroupResumeTarget,
  UpdateCheckResult,
  UpdateStartResult,
} from "./types";
import { PlanPane } from "./components/PlanPane";
import { DiffPane } from "./components/DiffPane";
import { ActivityPane } from "./components/ActivityPane";
import {
  InspectorRail,
  type InspectorTab,
} from "./components/InspectorRail";
import {
  filterCommands,
  getSlashMatch,
} from "./components/SlashPalette";
import { SettingsPane } from "./components/settings/SettingsPane";
import {
  countRunningBackground,
  countRunningTools,
  isToolDone,
  parseTaskBackgrounded,
  parseTaskCompleted,
  upsertBackgroundTask,
  upsertToolCall,
} from "./activity";
import {
  DEFAULT_EFFORTS,
  isMutatingTool,
  notifyOs,
  pickAllowOption,
  readFileAsDataUrl,
  type PendingImage,
} from "./lib/agentHelpers";
import {
  GIT_REFRESH_DEBOUNCE_MS,
  MAX_ASSISTANT_CHARS,
  MAX_THOUGHT_CHARS,
  MAX_TRANSCRIPT_ITEMS,
  STALL_MS,
} from "./lib/caps";
import { extractText, folderName, shortId, uid } from "./lib/format";
import {
  parseAvailableCommands,
  parsePlanEntries,
  planFromTodoInput,
} from "./lib/planParse";
import { MessageBubble } from "./components/chat/MessageBubble";
import { StallBanner } from "./components/chat/StallBanner";
import { PermissionBanner } from "./components/chat/PermissionBanner";
import { Composer } from "./components/chat/Composer";
import { Titlebar } from "./components/layout/Titlebar";
import { UpdateBanner } from "./components/layout/UpdateBanner";
import { LeftNavigator } from "./components/layout/LeftNavigator";
import { EmptyWorkbench } from "./components/layout/EmptyWorkbench";
import { SessionChrome } from "./components/session/SessionChrome";
import { ShortcutsHelp } from "./components/command/ShortcutsHelp";
import {
  CommandPalette,
  type PaletteCommand,
} from "./components/command/CommandPalette";

export default function App() {
  const [grok, setGrok] = useState<GrokStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [sessions, setSessions] = useState<DeskSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");
  const [prompt, setPrompt] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diskSessions, setDiskSessions] = useState<DiskSession[]>([]);
  const [showRecents, setShowRecents] = useState(false);
  /** Bookmarks that survive app restarts (`~/.config/grok-desk/pins.json`). */
  const [pins, setPins] = useState<SessionPin[]>([]);
  const [resumingPins, setResumingPins] = useState(false);
  const pinsRestoredRef = useRef(false);
  const [sessionGroups, setSessionGroups] = useState<SessionGroupsState>({
    groups: [],
    membership: {},
  });
  /** Right inspector: closed by default — chat-first. */
  const [inspectorTab, setInspectorTab] = useState<InspectorTab | null>(null);
  /** Left rail collapsed for focus mode (persisted). */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("grok-desk.sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  /** Desktop install version + GitHub update check. */
  const [appVersion, setAppVersion] = useState<AppVersionInfo | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(
    null,
  );
  const [updating, setUpdating] = useState(false);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);
  const [gitFiles, setGitFiles] = useState<GitFileStatus[]>([]);
  const [gitIsRepo, setGitIsRepo] = useState<boolean | null>(null);
  const [gitPatch, setGitPatch] = useState("");
  const [gitSelected, setGitSelected] = useState<string | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [stderrTail, setStderrTail] = useState<string[]>([]);
  /** Ticks while busy so stall banner can recompute. */
  const [clock, setClock] = useState(() => Date.now());
  /** Composer caret — drives slash palette matching. */
  const [composerCursor, setComposerCursor] = useState(0);
  const [slashIndex, setSlashIndex] = useState(0);
  /** Esc hides palette until the /token changes. */
  const [slashDismissed, setSlashDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  /** Avoid stale closures when answering plan approval reverse-requests. */
  const planApprovalRef = useRef<Record<string, PlanApprovalRequest>>({});
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const gitSelectedRef = useRef(gitSelected);
  gitSelectedRef.current = gitSelected;
  const gitRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  /** Per-session composer drafts (prompt + images) so tab switch never loses input. */
  const draftsRef = useRef<
    Record<string, { prompt: string; images: PendingImage[] }>
  >({});
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const pendingImagesRef = useRef(pendingImages);
  pendingImagesRef.current = pendingImages;

  const NEAR_BOTTOM_PX = 96;

  const saveDraft = useCallback((sessionId: string | null | undefined) => {
    if (!sessionId) return;
    draftsRef.current[sessionId] = {
      prompt: promptRef.current,
      images: pendingImagesRef.current,
    };
  }, []);

  const loadDraft = useCallback((sessionId: string | null | undefined) => {
    if (!sessionId) {
      setPrompt("");
      setPendingImages([]);
      setComposerCursor(0);
      return;
    }
    const d = draftsRef.current[sessionId];
    setPrompt(d?.prompt ?? "");
    setPendingImages(d?.images ?? []);
    setComposerCursor(d?.prompt?.length ?? 0);
    setSlashDismissed(false);
    setSlashIndex(0);
  }, []);

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
      setUpdating(true);
      setError(null);
      if (r.message) {
        /* surface in Settings log; also soft-notify */
        void notifyOs("Grok Desk update", r.message.slice(0, 120));
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

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

  const refreshGit = useCallback(async (cwd: string, path?: string | null) => {
    if (!cwd) return;
    setGitLoading(true);
    setGitError(null);
    try {
      const st = await invoke<{
        isRepo: boolean;
        files: GitFileStatus[];
        error?: string | null;
      }>("git_status", { cwd });
      setGitIsRepo(st.isRepo);
      setGitFiles(st.files ?? []);
      if (st.error) setGitError(st.error);
      const select =
        path ??
        gitSelectedRef.current ??
        st.files?.[0]?.path ??
        null;
      if (select && st.isRepo) {
        // Keep selection if still present; else first dirty file
        const stillThere = st.files?.some((f) => f.path === select);
        const pick = stillThere ? select : st.files?.[0]?.path ?? select;
        setGitSelected(pick);
        const d = await invoke<{
          path: string | null;
          patch: string;
          isRepo: boolean;
          error?: string | null;
        }>("git_diff", { cwd, path: pick });
        setGitPatch(d.patch ?? "");
        if (d.error) setGitError(d.error);
      } else if (!st.isRepo) {
        setGitPatch("");
        setGitSelected(null);
      } else {
        setGitPatch("");
      }
    } catch (e) {
      setGitError(String(e));
    } finally {
      setGitLoading(false);
    }
  }, []);

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

  /** Debounced git refresh after mutating tools (mid-run Diff updates). */
  const scheduleGitRefresh = useCallback(
    (sessionId: string) => {
      const s = sessionsRef.current.find((x) => x.sessionId === sessionId);
      if (!s?.cwd) return;
      // Only auto-refresh Diff for the active session's project
      if (activeId && sessionId !== activeId) return;
      if (gitRefreshTimer.current) clearTimeout(gitRefreshTimer.current);
      const cwd = s.cwd;
      gitRefreshTimer.current = setTimeout(() => {
        void refreshGit(cwd, gitSelectedRef.current);
      }, GIT_REFRESH_DEBOUNCE_MS);
    },
    [activeId, refreshGit],
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
      };
    }
    return streamBuf.current[sessionId];
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

  const refreshPins = useCallback(async () => {
    try {
      const list = await invoke<SessionPin[]>("list_pins");
      setPins(list);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshGroups = useCallback(async () => {
    try {
      const state = await invoke<SessionGroupsState>("list_session_groups");
      setSessionGroups({
        groups: state.groups ?? [],
        membership: state.membership ?? {},
        sessionRefs: state.sessionRefs ?? {},
      });
    } catch {
      /* ignore */
    }
  }, []);

  const isPinned = useCallback(
    (sessionId: string, cwd?: string) =>
      pins.some(
        (p) =>
          p.sessionId === sessionId &&
          (cwd == null || cwd === "" || p.cwd === cwd),
      ),
    [pins],
  );

  const pinSession = useCallback(
    async (sessionId: string, cwd: string, title?: string | null) => {
      try {
        const list = await invoke<SessionPin[]>("pin_session", {
          sessionId,
          cwd,
          title: title || null,
        });
        setPins(list);
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const unpinSession = useCallback(
    async (sessionId: string, cwd?: string) => {
      try {
        const list = await invoke<SessionPin[]>("unpin_session", {
          sessionId,
          cwd: cwd || null,
        });
        setPins(list);
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  /** Custom display name — survives restarts (Desk session-titles.json). */
  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      try {
        const saved = await invoke<string | null>("set_session_title", {
          sessionId,
          title,
        });
        const sess = sessionsRef.current.find((s) => s.sessionId === sessionId);
        const fallback = sess ? folderName(sess.cwd) : "Untitled";
        const display = (saved && saved.trim()) || fallback;
        patchSession(sessionId, (s) => ({ ...s, title: display }));
        // Keep group-pin resume metadata in sync
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

  const reorderPins = useCallback(async (sessionIds: string[]) => {
    try {
      const list = await invoke<SessionPin[]>("reorder_pins", { sessionIds });
      setPins(list);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshDisk();
    refreshPins();
    refreshGroups();
    invoke<string>("default_cwd").then(setCwd).catch(() => {});
  }, [refreshStatus, refreshDisk, refreshPins, refreshGroups]);

  const applyGroupsState = (state: SessionGroupsState) => {
    setSessionGroups({
      groups: state.groups ?? [],
      membership: state.membership ?? {},
      sessionRefs: state.sessionRefs ?? {},
    });
  };

  const createGroup = useCallback(
    async (name: string) => {
      try {
        applyGroupsState(
          await invoke<SessionGroupsState>("create_session_group", { name }),
        );
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const renameGroup = useCallback(async (groupId: string, name: string) => {
    try {
      applyGroupsState(
        await invoke<SessionGroupsState>("rename_session_group", {
          groupId,
          name,
        }),
      );
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const deleteGroup = useCallback(async (groupId: string) => {
    try {
      applyGroupsState(
        await invoke<SessionGroupsState>("delete_session_group", { groupId }),
      );
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const setGroupCollapsed = useCallback(
    async (groupId: string, collapsed: boolean) => {
      try {
        applyGroupsState(
          await invoke<SessionGroupsState>("set_group_collapsed", {
            groupId,
            collapsed,
          }),
        );
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const setSessionGroup = useCallback(
    async (sessionId: string, groupId: string | null) => {
      try {
        const sess = sessionsRef.current.find((s) => s.sessionId === sessionId);
        applyGroupsState(
          await invoke<SessionGroupsState>("set_session_group", {
            sessionId,
            groupId,
            cwd: sess?.cwd ?? null,
            title: sess?.title ?? null,
          }),
        );
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const setGroupPinned = useCallback(async (groupId: string, pinned: boolean) => {
    try {
      // Ensure every open member has a cwd ref before pinning (resume needs it)
      if (pinned) {
        const state = sessionGroups;
        const members = Object.entries(state.membership)
          .filter(([, gid]) => gid === groupId)
          .map(([sid]) => sid);
        for (const sid of members) {
          const sess = sessionsRef.current.find((s) => s.sessionId === sid);
          if (sess) {
            try {
              await invoke("touch_session_ref", {
                sessionId: sid,
                cwd: sess.cwd,
                title: sess.title ?? null,
              });
            } catch {
              /* ignore */
            }
          }
        }
      }
      applyGroupsState(
        await invoke<SessionGroupsState>("set_group_pinned", {
          groupId,
          pinned,
        }),
      );
    } catch (e) {
      setError(String(e));
    }
  }, [sessionGroups]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "grok-desk.sidebarCollapsed",
        sidebarCollapsed ? "1" : "0",
      );
    } catch {
      /* private mode */
    }
  }, [sidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v);
  }, []);

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
        buf.assistant += chunk;
        if (buf.assistant.length > MAX_ASSISTANT_CHARS) {
          buf.assistant = buf.assistant.slice(-MAX_ASSISTANT_CHARS);
        }
        const id = buf.aId ?? uid();
        buf.aId = id;
        const text = buf.assistant;
        patchSession(sessionId, (s) => {
          const rest = s.items.filter((i) => i.id !== id);
          return {
            ...s,
            items: [...rest, { id, role: "assistant", text }],
          };
        });
      } else if (kind === "user_message_chunk") {
        // Avoid doubles: we already add the user bubble optimistically on Send.
        // ACP often echoes the same full text as user_message_chunk (live turn
        // or session/load). Merge into the last user item when it matches.
        const chunk = extractText(update.content);
        if (!chunk) return;
        patchSession(sessionId, (s) => {
          const items = s.items;
          // Prefer last user message (most recent turn / optimistic bubble)
          let idx = -1;
          for (let i = items.length - 1; i >= 0; i--) {
            if (items[i].role === "user") {
              idx = i;
              break;
            }
          }
          if (idx >= 0) {
            const last = items[idx];
            // Exact duplicate of optimistic send or full replay of same message
            if (last.text === chunk) return s;
            // Cumulative stream replacing shorter prefix
            if (chunk.startsWith(last.text)) {
              const next = items.slice();
              next[idx] = { ...last, text: chunk };
              return { ...s, items: next };
            }
            // Delta stream: append if not already contained
            if (!last.text.includes(chunk)) {
              const next = items.slice();
              next[idx] = { ...last, text: last.text + chunk };
              return { ...s, items: next };
            }
            return s;
          }
          // History load with no optimistic bubble yet
          const buf = ensureBuf(sessionId);
          if (!buf.uId) {
            buf.uId = uid();
            buf.user = chunk;
          } else {
            buf.user += chunk;
          }
          const id = buf.uId;
          const text = buf.user;
          const rest = items.filter((i) => i.id !== id);
          return {
            ...s,
            items: [...rest, { id, role: "user", text }],
          };
        });
      } else if (kind === "agent_thought_chunk") {
        const chunk = extractText(update.content);
        if (!chunk) return;
        const buf = ensureBuf(sessionId);
        buf.thought += chunk;
        // Cap hard — unbounded thoughts OOM the webview (crash mid-run).
        if (buf.thought.length > MAX_THOUGHT_CHARS) {
          buf.thought =
            "…[thought truncated]…\n" +
            buf.thought.slice(-MAX_THOUGHT_CHARS);
        }
        const id = buf.tId ?? uid();
        buf.tId = id;
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
        const planFromTool = planFromTodoInput(update.rawInput ?? update);
        const prevTools =
          sessionsRef.current.find((s) => s.sessionId === sessionId)?.tools ??
          [];
        const tools = upsertToolCall(prevTools, update, Date.now());
        const id =
          (update.toolCallId as string) ||
          (update.tool_call_id as string) ||
          "";
        const tool = tools.find((t) => t.id === id);
        const title = tool?.title || "tool";
        const status = tool?.status || "in_progress";
        const kindStr = tool?.kind;

        if (!id && kind === "tool_call_update") return;

        patchSession(sessionId, (s) => {
          const nextTools = upsertToolCall(s.tools, update, Date.now());
          const t = nextTools.find((x) => x.id === id);
          const tTitle = t?.title || title;
          const tStatus = t?.status || status;
          const items = s.items.some((i) => i.id === `tool-${id}`)
            ? s.items.map((i) =>
                i.id === `tool-${id}`
                  ? { ...i, text: tTitle, meta: tStatus, status: tStatus }
                  : i,
              )
            : id
              ? [
                  ...s.items,
                  {
                    id: `tool-${id}`,
                    role: "tool" as const,
                    text: tTitle,
                    meta: tStatus,
                    status: tStatus,
                  },
                ]
              : s.items;
          return {
            ...s,
            tools: nextTools,
            items,
            plan: planFromTool ?? s.plan,
          };
        });
        if (isToolDone(status) && isMutatingTool(title, kindStr)) {
          scheduleGitRefresh(sessionId);
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
      const typing =
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

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

      // Esc layers: palette → help → inspector
      if (e.key === "Escape") {
        if (showPalette) {
          setShowPalette(false);
          return;
        }
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (inspectorTab) {
          setInspectorTab(null);
          return;
        }
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle open sessions
      if ((e.ctrlKey || e.metaKey) && e.key === "Tab") {
        e.preventDefault();
        cycleSession(e.shiftKey ? -1 : 1);
        return;
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

      // Ctrl/Cmd+L — focus composer
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "l") {
        if (typing && target?.tagName === "TEXTAREA") return;
        e.preventDefault();
        focusComposer();
        return;
      }

      if (typing) return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showShortcuts, showPalette, inspectorTab, cycleSession, focusComposer, cwd]);

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
      await invoke("agent_stop");
      setRunning(false);
      setInfo(null);
      setSessions([]);
      setActiveId(null);
      draftsRef.current = {};
      loadDraft(null);
      pinsRestoredRef.current = false;
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
        title: customTitle || s.title || folderName(s.cwd),
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
          title: d.title || folderName(d.cwd),
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
        return true;
      }

      streamBuf.current[d.sessionId] = {
        assistant: "",
        thought: "",
        user: "",
        aId: null,
        tId: null,
        uId: null,
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
        title: customTitle || d.title || s.title,
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
    delete draftsRef.current[sessionId];
    delete streamBuf.current[sessionId];
    delete stickBottomRef.current[sessionId];
    inFlightRef.current.delete(sessionId);
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

  const addImageFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    for (const file of list) {
      const dataUrl = await readFileAsDataUrl(file);
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) continue;
      const previewUrl = dataUrl;
      setPendingImages((prev) => [
        ...prev,
        {
          id: uid(),
          mimeType: m[1] || file.type || "image/png",
          data: m[2],
          name: file.name || `paste-${Date.now()}.png`,
          previewUrl,
        },
      ]);
    }
  };

  const onComposerPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      void addImageFiles(files);
    }
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
        s.title === folderName(s.cwd) &&
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
    setGitSelected(path);
    setGitLoading(true);
    try {
      const d = await invoke<{
        path: string | null;
        patch: string;
        error?: string | null;
      }>("git_diff", { cwd: active.cwd, path });
      setGitPatch(d.patch ?? "");
      if (d.error) setGitError(d.error);
    } catch (e) {
      setGitError(String(e));
    } finally {
      setGitLoading(false);
    }
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
  const activityLive = active
    ? countRunningTools(active.tools) +
      countRunningBackground(active.backgroundTasks ?? [])
    : 0;
  const activityBadge =
    activityLive > 0 ? String(activityLive) : active?.busy ? "…" : null;
  // stickTick forces re-render when the user pins/unpins auto-scroll.
  const showJumpToLatest =
    !!active && stickTick >= 0 && !isStuckToBottom(active.sessionId);

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
    }

    return cmds;
  }, [
    running,
    grok?.available,
    cwd,
    active,
    sessions,
    pins,
    sidebarCollapsed,
    showRecents,
    selectSession,
    focusComposer,
    isPinned,
  ]);

  return (
    <div className="flex h-full flex-col">
      <Titlebar
        running={running}
        headerStatus={headerStatus}
        activeBusy={active?.busy}
        activePermissionCount={active?.permissions.length}
        info={info}
        grok={grok}
        appVersion={appVersion}
        updateAvailable={!!updateCheck?.updateAvailable && !updateBannerDismissed}
        onShowShortcuts={() => setShowShortcuts(true)}
        onOpenUpdates={() => {
          setInspectorTab("settings");
          setUpdateBannerDismissed(false);
        }}
      />
      {(updateCheck?.updateAvailable || updating) &&
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
            updating={updating}
            onUpdate={() => void startAppUpdate()}
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
            {active ? (
              <>
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
                    className="h-full overflow-y-auto px-4 py-4"
                  >
                    <div className="mx-auto max-w-3xl space-y-3">
                      {active.items.map((item) => (
                        <MessageBubble key={item.id} item={item} />
                      ))}
                    </div>
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

                {error && (
                  <div className="border-t border-[var(--danger)]/40 bg-[var(--bg-danger-subtle)] px-4 py-2 text-xs text-[var(--danger)]">
                    {error}
                  </div>
                )}

                <Composer
                  busy={active.busy}
                  prompt={prompt}
                  onPromptChange={(value, cursor) => {
                    setPrompt(value);
                    setComposerCursor(cursor);
                  }}
                  onCursor={setComposerCursor}
                  composerRef={composerRef}
                  pendingImages={pendingImages}
                  onRemoveImage={(id) =>
                    setPendingImages((prev) => prev.filter((p) => p.id !== id))
                  }
                  onPaste={onComposerPaste}
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
                />
              </>
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
                  busy={active.busy}
                />
              )}
              {inspectorTab === "settings" && (
                <SettingsPane
                  versionInfo={appVersion}
                  updateCheck={updateCheck}
                  updating={updating}
                  onCheckUpdates={() => void checkForUpdates()}
                  onStartUpdate={() => void startAppUpdate()}
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
    </div>
  );
}
