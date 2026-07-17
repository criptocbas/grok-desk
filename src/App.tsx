import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AgentInfo,
  ChatItem,
  DeskSession,
  DiskSession,
  GrokStatus,
  PermissionRequest,
  PlanEntry,
  SessionInfo,
} from "./types";
import { PlanPane } from "./components/PlanPane";

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

/** Lightweight markdown-ish rendering for assistant bubbles. */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        if (block.startsWith("```")) {
          const inner = block.replace(/^```\w*\n?/, "").replace(/```$/, "");
          return (
            <pre
              key={i}
              className="mono overflow-x-auto rounded-md bg-black/40 px-3 py-2 text-[12px] text-[var(--tool)]"
            >
              {inner}
            </pre>
          );
        }
        return (
          <div key={i} className="whitespace-pre-wrap">
            {block.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return (
                  <strong key={j} className="font-semibold text-white">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              if (part.startsWith("`") && part.endsWith("`")) {
                return (
                  <code
                    key={j}
                    className="mono rounded bg-white/10 px-1 py-0.5 text-[12px] text-[var(--tool)]"
                  >
                    {part.slice(1, -1)}
                  </code>
                );
              }
              if (part.startsWith("### ")) {
                return (
                  <div key={j} className="mt-2 text-[13px] font-semibold text-white">
                    {part.slice(4)}
                  </div>
                );
              }
              if (part.startsWith("## ")) {
                return (
                  <div key={j} className="mt-2 text-sm font-semibold text-white">
                    {part.slice(3)}
                  </div>
                );
              }
              return <span key={j}>{part}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

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
  const [stderrTail, setStderrTail] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const patchSession = useCallback(
    (sessionId: string, fn: (s: DeskSession) => DeskSession) => {
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? fn(s) : s)),
      );
    },
    [],
  );

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
      patchSession(sid, (s) => ({
        ...s,
        permissions: [...s.permissions, p],
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

      if (kind === "agent_message_chunk") {
        const chunk = extractText(update.content);
        if (!chunk) return;
        const buf = ensureBuf(sessionId);
        buf.assistant += chunk;
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
        const planFromTool = planFromTodoInput(update.rawInput ?? update);
        patchSession(sessionId, (s) => {
          const tools = [
            ...s.tools.filter((t) => t.id !== id),
            {
              id,
              title,
              kind: update.kind as string | undefined,
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
      } else if (kind === "tool_call_update") {
        const id =
          (update.toolCallId as string) ||
          (update.tool_call_id as string) ||
          "";
        const status = (update.status as string) || "updated";
        if (!id) return;
        const planFromTool = planFromTodoInput(update.rawInput ?? update);
        patchSession(sessionId, (s) => ({
          ...s,
          tools: s.tools.map((t) =>
            t.id === id ? { ...t, status, raw: update } : t,
          ),
          items: s.items.map((i) =>
            i.id === `tool-${id}` ? { ...i, meta: status, status } : i,
          ),
          plan: planFromTool ?? s.plan,
        }));
      }
    }).then(track);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [patchSession]);

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
      };
      setSessions((prev) => [desk, ...prev]);
      setActiveId(s.sessionId);
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
        };
        return [desk, ...prev];
      });
      setActiveId(d.sessionId);
      if (alreadyOpen) return;

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
      patchSession(d.sessionId, (s) => ({
        ...s,
        busy: false,
        planDoc,
        items: [
          ...s.items.filter((i) => i.role !== "system" || !i.text.startsWith("Loading")),
          {
            id: uid(),
            role: "system",
            text: `Resumed · ${d.cwd}`,
          },
        ],
      }));
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

  const send = async () => {
    if (!active || !prompt.trim() || active.busy) return;
    const text = prompt.trim();
    const sessionId = active.sessionId;
    setPrompt("");
    setError(null);
    const buf = ensureBuf(sessionId);
    buf.assistant = "";
    buf.thought = "";
    buf.user = text;
    buf.aId = null;
    buf.tId = null;
    // Stable id so ACP user_message_chunk echo can merge instead of duplicating
    const userMsgId = uid();
    buf.uId = userMsgId;

    patchSession(sessionId, (s) => ({
      ...s,
      busy: true,
      items: [...s.items, { id: userMsgId, role: "user", text }],
      // Promote title from first user message if still folder name
      title:
        s.title === folderName(s.cwd) && text.length < 60
          ? text
          : s.title,
    }));

    try {
      const result = await invoke<Record<string, unknown>>("session_prompt", {
        sessionId,
        text,
      });
      const meta = (result?._meta ?? result) as Record<string, unknown> | undefined;
      const out =
        typeof meta?.outputTokens === "number"
          ? ` · ${meta.outputTokens} out`
          : "";
      const model =
        typeof meta?.modelId === "string" ? ` · ${meta.modelId}` : "";
      // Reset stream ids for the next turn
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
            text: `Turn complete${model}${out}`,
            meta: "stop",
          },
        ],
      }));
      await refreshDisk();
    } catch (e) {
      setError(String(e));
      patchSession(sessionId, (s) => ({ ...s, busy: false }));
    }
  };

  const cancel = async () => {
    if (!active) return;
    try {
      await invoke("session_cancel", { sessionId: active.sessionId });
    } catch (e) {
      setError(String(e));
    }
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

  const enterPlanMode = () => {
    void steer(
      "Enter plan mode. Design a clear multi-step plan for the current goal. " +
        "Do not implement code yet — wait for my explicit approval. " +
        "Use todos / plan entries I can track.",
    );
  };

  const approvePlan = () => {
    void steer(
      "Plan approved. Execute the plan step by step. " +
        "Update todo/plan status as you complete each step. Prefer small, verifiable diffs.",
    );
  };

  const revisePlan = () => {
    setPrompt("Please revise the plan: ");
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

  const headerStatus = useMemo(() => {
    if (!grok?.available) return "Grok CLI missing";
    if (!running) return "Disconnected";
    if (!active) return "Connected · no session";
    return active.busy ? "Running…" : "Ready";
  }, [grok, running, active]);

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
          <span className="text-xs text-[var(--text-muted)]">v0.3 · Plan + mission control</span>
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
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="mono w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[11px] outline-none focus:border-[var(--accent)]"
              placeholder="/path/to/project"
              spellCheck={false}
            />
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
                <span className="mono ml-auto">
                  {active.modelId || info?.modelId || "—"}
                </span>
              </div>

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
                <div className="mx-auto flex max-w-3xl gap-2">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    disabled={active.busy}
                    rows={2}
                    placeholder="Message Grok… (Enter to send)"
                    className="min-h-[52px] flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-50"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={send}
                      disabled={active.busy || !prompt.trim()}
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
          <PlanPane
            plan={active.plan}
            modeId={active.modeId}
            planDoc={active.planDoc}
            busy={active.busy}
            open={planOpen}
            onToggle={() => setPlanOpen((v) => !v)}
            onEnterPlanMode={enterPlanMode}
            onApprove={approvePlan}
            onRevise={revisePlan}
            onRefreshDoc={() => void refreshPlanDoc()}
          />
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
      <div className="rounded-lg border border-[var(--thought)]/20 bg-[var(--thought)]/5 px-3 py-2 text-xs leading-relaxed text-[var(--thought)]">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">
          Thinking
        </div>
        <div className="whitespace-pre-wrap">{item.text}</div>
      </div>
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
