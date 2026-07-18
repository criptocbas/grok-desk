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
  ChatItem,
  DeskSession,
  DiskSession,
  GitFileStatus,
  GrokStatus,
  PermissionRequest,
  PlanApprovalRequest,
  PlanEntry,
  ReviewComment,
  SessionInfo,
} from "./types";
import { PlanPane } from "./components/PlanPane";
import { DiffPane } from "./components/DiffPane";
import { RichText } from "./components/RichText";

/** Prevent webview OOM from multi-hour thought streams / session replay. */
const MAX_THOUGHT_CHARS = 6_000;
const MAX_ASSISTANT_CHARS = 400_000;
const MAX_TRANSCRIPT_ITEMS = 400;
/** No ACP session update for this long while busy → show stall banner. */
const STALL_MS = 90_000;
/** Debounce git status after file-mutating tools. */
const GIT_REFRESH_DEBOUNCE_MS = 900;

/** Tools that usually change the working tree — trigger auto Diff refresh. */
function isMutatingTool(title: string, kind?: string): boolean {
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

function isToolDone(status: string): boolean {
  const s = status.toLowerCase();
  return s === "completed" || s === "success" || s === "done" || s === "failed" || s === "error";
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function extractText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (typeof content === "object" && content !== null) {
    const c = content as Record<string, unknown>;
    if (typeof c.text === "string") return c.text;
    if (c.type === "text" && typeof c.text === "string") return c.text;
  }
  return "";
}

function folderName(cwd: string) {
  const parts = cwd.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || cwd;
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function formatTime(iso?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type PendingImage = {
  id: string;
  mimeType: string;
  data: string;
  name: string;
  previewUrl: string;
};

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
  const [planOpen, setPlanOpen] = useState(true);
  const [diffOpen, setDiffOpen] = useState(true);
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  /** Avoid stale closures when answering plan approval reverse-requests. */
  const planApprovalRef = useRef<Record<string, PlanApprovalRequest>>({});
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const gitSelectedRef = useRef(gitSelected);
  gitSelectedRef.current = gitSelected;
  const gitRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** sessionIds where user hit Stop — late prompt resolve should not re-busy. */
  const cancelRequested = useRef<Set<string>>(new Set());
  /** Last ACP traffic per session (stall detection without re-render spam). */
  const lastActivityRef = useRef<Record<string, number>>({});
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

  useEffect(() => {
    refreshStatus();
    refreshDisk();
    invoke<string>("default_cwd").then(setCwd).catch(() => {});
  }, [refreshStatus, refreshDisk]);

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
      patchSession(sid, (s) => ({
        ...s,
        permissions: [...s.permissions, p],
      }));
    }).then(track);

    void listen<PlanApprovalRequest>("acp://plan-approval", (e) => {
      const p = e.payload;
      if (!p?.sessionId) return;
      planApprovalRef.current[p.sessionId] = p;
      setPlanOpen(true);
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
      } else if (kind === "tool_call") {
        const id =
          (update.toolCallId as string) ||
          (update.tool_call_id as string) ||
          uid();
        const title =
          (update.title as string) || (update.tool as string) || "tool";
        const status = (update.status as string) || "pending";
        const kindStr = update.kind as string | undefined;
        const planFromTool = planFromTodoInput(update.rawInput ?? update);
        patchSession(sessionId, (s) => {
          const tools = [
            ...s.tools.filter((t) => t.id !== id),
            {
              id,
              title,
              kind: kindStr,
              status,
              raw: update,
            },
          ];
          const items = s.items.some((i) => i.id === `tool-${id}`)
            ? s.items.map((i) =>
                i.id === `tool-${id}`
                  ? { ...i, text: title, meta: status, status }
                  : i,
              )
            : [
                ...s.items,
                {
                  id: `tool-${id}`,
                  role: "tool" as const,
                  text: title,
                  meta: status,
                  status,
                },
              ];
          return {
            ...s,
            tools,
            items,
            plan: planFromTool ?? s.plan,
          };
        });
        if (isToolDone(status) && isMutatingTool(title, kindStr)) {
          scheduleGitRefresh(sessionId);
        }
      } else if (kind === "tool_call_update") {
        const id =
          (update.toolCallId as string) ||
          (update.tool_call_id as string) ||
          "";
        const status = (update.status as string) || "updated";
        if (!id) return;
        const planFromTool = planFromTodoInput(update.rawInput ?? update);
        // Title may only live on the prior tool_call row
        const prevTitle =
          sessionsRef.current
            .find((s) => s.sessionId === sessionId)
            ?.tools.find((t) => t.id === id)?.title ?? "";
        const title =
          (update.title as string) ||
          (update.tool as string) ||
          prevTitle ||
          "tool";
        const kindStr =
          (update.kind as string | undefined) ||
          sessionsRef.current
            .find((s) => s.sessionId === sessionId)
            ?.tools.find((t) => t.id === id)?.kind;
        patchSession(sessionId, (s) => ({
          ...s,
          tools: s.tools.map((t) =>
            t.id === id ? { ...t, status, raw: update, title: title || t.title } : t,
          ),
          items: s.items.map((i) =>
            i.id === `tool-${id}` ? { ...i, meta: status, status } : i,
          ),
          plan: planFromTool ?? s.plan,
        }));
        if (isToolDone(status) && isMutatingTool(title, kindStr)) {
          scheduleGitRefresh(sessionId);
        }
      }
    }).then(track);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [patchSession, scheduleGitRefresh, touchActivity]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [active?.items, active?.permissions]);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const i = await invoke<AgentInfo>("agent_start");
      setInfo(i);
      setRunning(true);
      await refreshDisk();
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
    } catch (e) {
      setError(String(e));
    }
  };

  const openSession = async () => {
    setError(null);
    try {
      if (!running) await connect();
      const s = await invoke<SessionInfo>("session_new", { cwd });
      const desk: DeskSession = {
        sessionId: s.sessionId,
        cwd: s.cwd,
        title: s.title || folderName(s.cwd),
        modelId: s.modelId,
        items: [
          {
            id: uid(),
            role: "system",
            text: `Session ${shortId(s.sessionId)} · ${s.cwd}`,
          },
        ],
        tools: [],
        permissions: [],
        busy: false,
        createdAt: Date.now(),
        plan: [],
        modeId: null,
        planDoc: null,
        reviewComments: [],
        planApproval: null,
      };
      setSessions((prev) => [desk, ...prev]);
      setActiveId(s.sessionId);
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

  const resumeDisk = async (d: DiskSession) => {
    setError(null);
    setShowRecents(false);
    try {
      if (!running) {
        const i = await invoke<AgentInfo>("agent_start");
        setInfo(i);
        setRunning(true);
      }
      // Avoid duplicate open tabs
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
          modelId: d.modelId,
          items: [
            {
              id: uid(),
              role: "system",
              text: `Loading ${shortId(d.sessionId)}…`,
            },
          ],
          tools: [],
          permissions: [],
          busy: true,
          createdAt: Date.now(),
          plan: [],
          modeId: null,
          planDoc: null,
          reviewComments: [],
          planApproval: null,
        };
        return [desk, ...prev];
      });
      setActiveId(d.sessionId);
      if (alreadyOpen) {
        void refreshGit(d.cwd);
        return;
      }

      // Clear stream buffers — history will replay via session/update
      streamBuf.current[d.sessionId] = {
        assistant: "",
        thought: "",
        user: "",
        aId: null,
        tId: null,
        uId: null,
      };
      setCwd(d.cwd);

      await invoke<SessionInfo>("session_load", {
        sessionId: d.sessionId,
        cwd: d.cwd,
      });
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
      // Drop oversized thoughts from replay so resume doesn't freeze the UI
      patchSession(d.sessionId, (s) => ({
        ...s,
        busy: false,
        planDoc,
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
      void refreshGit(d.cwd);
    } catch (e) {
      setError(String(e));
      patchSession(d.sessionId, (s) => ({ ...s, busy: false }));
    }
  };

  const closeSession = (sessionId: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.sessionId !== sessionId);
      if (activeId === sessionId) {
        setActiveId(next[0]?.sessionId ?? null);
      }
      return next;
    });
    delete streamBuf.current[sessionId];
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

  const send = async () => {
    if (!active || active.busy) return;
    if (!prompt.trim() && pendingImages.length === 0) return;
    const userText = prompt.trim();
    let text = userText;
    const sessionId = active.sessionId;
    const comments = active.reviewComments ?? [];
    const images = [...pendingImages];
    if (comments.length > 0) {
      const block = comments
        .map((c) => {
          const loc =
            c.startLine != null
              ? `${c.path}:${c.startLine}`
              : c.path;
          const snip = c.snippet ? `\n  > ${c.snippet}` : "";
          return `- ${loc}: ${c.body}${snip}`;
        })
        .join("\n");
      text =
        `${text || "Please address the review comments."}\n\n## Review comments (apply these fixes)\n${block}`;
    }
    setPrompt("");
    setPendingImages([]);
    setError(null);
    const buf = ensureBuf(sessionId);
    buf.assistant = "";
    buf.thought = "";
    buf.user = text;
    buf.aId = null;
    buf.tId = null;
    const userMsgId = uid();
    buf.uId = userMsgId;

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

    cancelRequested.current.delete(sessionId);
    lastActivityRef.current[sessionId] = Date.now();
    patchSession(sessionId, (s) => ({
      ...s,
      busy: true,
      lastActivityAt: Date.now(),
      reviewComments: [],
      items: [
        ...s.items,
        {
          id: userMsgId,
          role: "user",
          text: displayBits || userText || text,
        },
      ],
      title:
        s.title === folderName(s.cwd) && userText.length > 0 && userText.length < 60
          ? userText
          : s.title,
    }));

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
      const meta = (result?._meta ?? result) as Record<string, unknown> | undefined;
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

      patchSession(sessionId, (s) => ({
        ...s,
        busy: false,
        items: [
          ...s.items,
          {
            id: uid(),
            role: "system",
            text: wasCancelled
              ? `Turn ended after stop${model}${out}`
              : `Turn complete${model}${out}`,
            meta: "stop",
          },
        ],
      }));
      await refreshDisk();
      const cwd =
        sessionsRef.current.find((s) => s.sessionId === sessionId)?.cwd ??
        active.cwd;
      if (cwd) void refreshGit(cwd, gitSelectedRef.current);
    } catch (e) {
      const msg = String(e);
      const wasCancelled = cancelRequested.current.has(sessionId);
      cancelRequested.current.delete(sessionId);
      if (!wasCancelled) {
        setError(
          msg.toLowerCase().includes("timed out")
            ? "Agent turn timed out (hard ceiling). Click Stop if tools are still running, then try a smaller step."
            : msg,
        );
      }
      patchSession(sessionId, (s) => ({ ...s, busy: false }));
      const cwd =
        sessionsRef.current.find((s) => s.sessionId === sessionId)?.cwd;
      if (cwd) void refreshGit(cwd, gitSelectedRef.current);
    }
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

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              running
                ? "bg-[var(--success)] shadow-[0_0_8px_var(--success)]"
                : "bg-[var(--text-muted)]"
            }`}
          />
          <span className="text-sm font-semibold tracking-wide">Grok Desk</span>
          <span className="text-xs text-[var(--text-muted)]">v0.7 · Reliability</span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="mono">{headerStatus}</span>
          {info?.subscriptionTier && (
            <span className="rounded bg-[var(--accent)]/15 px-2 py-0.5 text-[var(--accent)]">
              {info.subscriptionTier}
            </span>
          )}
          {info?.authEmail && (
            <span className="hidden md:inline">{info.authEmail}</span>
          )}
          {grok?.version && (
            <span className="mono rounded bg-[var(--bg-panel)] px-2 py-0.5">
              {grok.version}
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
          <div className="space-y-3 border-b border-[var(--border)] p-3">
            <div className="flex gap-2">
              {!running ? (
                <button
                  onClick={connect}
                  disabled={connecting || !grok?.available}
                  className="flex-1 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black hover:bg-[var(--accent-dim)] disabled:opacity-40"
                >
                  {connecting ? "Connecting…" : "Connect"}
                </button>
              ) : (
                <button
                  onClick={disconnect}
                  className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                >
                  Disconnect
                </button>
              )}
              <button
                onClick={() => {
                  setShowRecents((v) => !v);
                  void refreshDisk();
                }}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]"
                title="Recent sessions on disk"
              >
                Recents
              </button>
            </div>

            <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Project folder
            </div>
            <div className="flex gap-1">
              <input
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                title={cwd}
                className="mono min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[11px] outline-none focus:border-[var(--accent)]"
                placeholder="/path/to/project"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => void browseFolder()}
                title="Choose folder"
                className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm hover:border-[var(--accent)]"
              >
                …
              </button>
            </div>
            <button
              onClick={openSession}
              disabled={!cwd}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-40"
            >
              + New session
            </button>
          </div>

          {/* Open sessions */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Open sessions ({sessions.length})
            </div>
            {sessions.length === 0 ? (
              <p className="px-2 text-xs text-[var(--text-muted)]">
                Connect and open a session on a project folder.
              </p>
            ) : (
              <ul className="space-y-1">
                {sessions.map((s) => {
                  const selected = s.sessionId === activeId;
                  return (
                    <li key={s.sessionId}>
                      <button
                        onClick={() => setActiveId(s.sessionId)}
                        className={`group flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                          selected
                            ? "border-[var(--accent)]/50 bg-[var(--accent)]/10"
                            : "border-transparent hover:bg-white/5"
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            s.busy
                              ? "animate-pulse bg-[var(--warning)]"
                              : s.permissions.length
                                ? "bg-[var(--danger)]"
                                : "bg-[var(--success)]"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {s.title}
                          </div>
                          <div className="mono truncate text-[10px] text-[var(--text-muted)]">
                            {folderName(s.cwd)} · {shortId(s.sessionId)}
                            {s.plan.length > 0
                              ? ` · ${s.plan.filter((e) => e.status === "completed").length}/${s.plan.length}`
                              : ""}
                          </div>
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            closeSession(s.sessionId);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              closeSession(s.sessionId);
                            }
                          }}
                          className="rounded px-1 text-[var(--text-muted)] opacity-0 hover:bg-white/10 hover:text-[var(--danger)] group-hover:opacity-100"
                        >
                          ×
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {showRecents && (
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  From disk
                </div>
                <ul className="space-y-1">
                  {diskSessions.slice(0, 15).map((d) => (
                    <li key={d.sessionId}>
                      <button
                        onClick={() => void resumeDisk(d)}
                        disabled={!running && !grok?.available}
                        className="w-full rounded-md px-2.5 py-2 text-left hover:bg-white/5 disabled:opacity-40"
                      >
                        <div className="truncate text-xs font-medium">
                          {d.title || folderName(d.cwd)}
                        </div>
                        <div className="mono truncate text-[10px] text-[var(--text-muted)]">
                          {folderName(d.cwd)} · {formatTime(d.updatedAt)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Tools for active session */}
          <div className="max-h-48 overflow-auto border-t border-[var(--border)] p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Tool activity
            </div>
            {!active || active.tools.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No tools yet.</p>
            ) : (
              <ul className="space-y-1">
                {[...active.tools].reverse().slice(0, 12).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                  >
                    <span className="font-medium text-[var(--tool)]">{t.title}</span>
                    <span
                      className={`mono text-[10px] ${
                        t.status === "completed"
                          ? "text-[var(--success)]"
                          : t.status === "failed"
                            ? "text-[var(--danger)]"
                            : "text-[var(--text-muted)]"
                      }`}
                    >
                      {t.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {stderrTail.length > 0 && (
            <details className="border-t border-[var(--border)] p-2 text-[10px] text-[var(--text-muted)]">
              <summary className="cursor-pointer">Agent stderr</summary>
              <pre className="mono mt-1 max-h-24 overflow-auto whitespace-pre-wrap">
                {stderrTail.slice(-10).join("\n")}
              </pre>
            </details>
          )}
        </aside>

        {/* Main + plan */}
        <div className="flex min-w-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {active ? (
            <>
              <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]/60 px-4 py-2 text-xs text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text)]">{active.title}</span>
                <span className="mono truncate">{active.cwd}</span>
                {active.modeId === "plan" && (
                  <span className="rounded bg-[var(--thought)]/20 px-1.5 py-0.5 text-[10px] text-[var(--thought)]">
                    plan mode
                  </span>
                )}
                {active.plan.length > 0 && (
                  <span className="mono text-[10px] text-[var(--text-muted)]">
                    plan {active.plan.filter((e) => e.status === "completed").length}/
                    {active.plan.length}
                  </span>
                )}
                {gitFiles.length > 0 && (
                  <span className="mono text-[10px] text-[var(--tool)]">
                    {gitFiles.length} changed
                  </span>
                )}
                {(active.reviewComments?.length ?? 0) > 0 && (
                  <span className="rounded bg-[var(--warning)]/20 px-1.5 py-0.5 text-[10px] text-[var(--warning)]">
                    {active.reviewComments.length} review note
                    {active.reviewComments.length === 1 ? "" : "s"} → next send
                  </span>
                )}
                <span className="mono ml-auto">
                  {active.modelId || info?.modelId || "—"}
                </span>
              </div>

              {isStalled && (
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--warning)]/40 bg-[#2a1f08] px-4 py-2 text-xs">
                  <span className="text-[var(--warning)]">
                    No agent traffic for {stallSeconds}s — may still be thinking, or
                    stuck mid-tool.
                  </span>
                  <button
                    type="button"
                    onClick={() => void cancel()}
                    className="rounded border border-[var(--warning)]/50 px-2 py-0.5 text-[var(--warning)] hover:bg-[var(--warning)]/10"
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    onClick={() => unlockUi(active.sessionId)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    Unlock UI
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshGit(active.cwd, gitSelected)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-[var(--tool)] hover:bg-[var(--tool)]/10"
                  >
                    Refresh diffs
                  </button>
                </div>
              )}

              {active.permissions.length > 0 && (
                <div className="space-y-2 border-b border-[var(--warning)]/40 bg-[#2a1f08] px-4 py-3">
                  {active.permissions.map((p) => (
                    <div
                      key={p.requestId}
                      className="rounded-md border border-[var(--warning)]/50 bg-[var(--bg)] p-3"
                    >
                      <div className="mb-1 text-xs font-semibold text-[var(--warning)]">
                        Permission required
                      </div>
                      <pre className="mono mb-2 max-h-24 overflow-auto text-[11px] text-[var(--text-muted)]">
                        {JSON.stringify(p.toolCall ?? p.raw, null, 2).slice(0, 600)}
                      </pre>
                      <div className="flex flex-wrap gap-2">
                        {p.options.map((o) => (
                          <button
                            key={o.optionId}
                            onClick={() =>
                              respondPermission(
                                active.sessionId,
                                p.requestId,
                                o.optionId,
                              )
                            }
                            className="rounded bg-[var(--accent)] px-3 py-1 text-xs font-medium text-black"
                          >
                            {o.name || o.optionId}
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            respondPermission(active.sessionId, p.requestId, null)
                          }
                          className="rounded border border-[var(--danger)] px-3 py-1 text-xs text-[var(--danger)]"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
              >
                <div className="mx-auto max-w-3xl space-y-3">
                  {active.items.map((item) => (
                    <MessageBubble key={item.id} item={item} />
                  ))}
                </div>
              </div>

              {error && (
                <div className="border-t border-[var(--danger)]/40 bg-[#2a1018] px-4 py-2 text-xs text-[var(--danger)]">
                  {error}
                </div>
              )}

              <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <div className="mx-auto max-w-3xl">
                  {pendingImages.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {pendingImages.map((img) => (
                        <div
                          key={img.id}
                          className="relative h-16 w-16 overflow-hidden rounded-md border border-[var(--border)]"
                        >
                          <img
                            src={img.previewUrl}
                            alt={img.name}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPendingImages((prev) =>
                                prev.filter((p) => p.id !== img.id),
                              )
                            }
                            className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[10px] text-white"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      ref={composerRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onPaste={onComposerPaste}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      disabled={active.busy}
                      rows={2}
                      placeholder="Message Grok… (Enter send · paste screenshots)"
                      className="min-h-[52px] flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-50"
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={send}
                        disabled={
                          active.busy ||
                          (!prompt.trim() && pendingImages.length === 0)
                        }
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
                      >
                        {active.busy ? "…" : "Send"}
                      </button>
                      {active.busy && (
                        <button
                          onClick={cancel}
                          className="rounded-lg border border-[var(--border)] px-4 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--danger)]"
                        >
                          Stop
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-[var(--text-muted)]">
              <p className="text-lg font-medium text-[var(--text)]">
                Mission control for Grok Build
              </p>
              <p className="max-w-md text-sm leading-relaxed">
                Connect with SuperGrok Heavy, open multiple sessions on any
                project, resume from disk, and keep tools streaming in one place.
              </p>
              {!running && (
                <button
                  onClick={connect}
                  disabled={connecting || !grok?.available}
                  className="mt-2 rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-medium text-black disabled:opacity-40"
                >
                  {connecting ? "Connecting…" : "Connect to Grok"}
                </button>
              )}
            </div>
          )}
        </main>

        {active && (
          <>
            <PlanPane
              plan={active.plan}
              modeId={active.modeId}
              planDoc={active.planDoc}
              planApproval={active.planApproval}
              busy={active.busy}
              open={planOpen}
              onToggle={() => setPlanOpen((v) => !v)}
              onEnterPlanMode={enterPlanMode}
              onApprove={approvePlan}
              onRevise={revisePlan}
              onRefreshDoc={() => void refreshPlanDoc()}
              onAbandonPlan={abandonPlan}
            />
            <DiffPane
              open={diffOpen}
              onToggle={() => setDiffOpen((v) => !v)}
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
          </>
        )}
        </div>
      </div>
    </div>
  );
}

function parsePlanEntries(raw: unknown): PlanEntry[] | null {
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
function planFromTodoInput(raw: unknown): PlanEntry[] | null {
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

function MessageBubble({ item }: { item: ChatItem }) {
  if (item.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent-dim)]/30 px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
          {item.text}
        </div>
      </div>
    );
  }
  if (item.role === "thought") {
    return (
      <details className="rounded-lg border border-[var(--thought)]/20 bg-[var(--thought)]/5 px-3 py-2 text-xs leading-relaxed text-[var(--thought)]">
        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider opacity-70">
          Thinking
          {item.text.length > 200
            ? ` · ${Math.round(item.text.length / 1000)}k chars`
            : ""}
        </summary>
        <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
          {item.text}
        </div>
      </details>
    );
  }
  if (item.role === "tool") {
    return (
      <div className="mono flex items-center gap-2 text-xs text-[var(--tool)]">
        <span className="rounded bg-[var(--tool)]/10 px-1.5 py-0.5">tool</span>
        <span>{item.text}</span>
        {item.meta && (
          <span
            className={
              item.meta === "completed"
                ? "text-[var(--success)]"
                : item.meta === "failed"
                  ? "text-[var(--danger)]"
                  : "text-[var(--text-muted)]"
            }
          >
            · {item.meta}
          </span>
        )}
      </div>
    );
  }
  if (item.role === "system") {
    return (
      <div className="text-center text-[11px] text-[var(--text-muted)]">
        {item.text}
      </div>
    );
  }
  return (
    <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bg-panel)] px-3.5 py-2">
      <RichText text={item.text} />
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
