import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AgentInfo,
  ChatItem,
  GrokStatus,
  PermissionRequest,
  SessionInfo,
  ToolCallItem,
} from "./types";

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

export default function App() {
  const [grok, setGrok] = useState<GrokStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [cwd, setCwd] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [tools, setTools] = useState<ToolCallItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [stderrTail, setStderrTail] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantBuf = useRef("");
  const thoughtBuf = useRef("");
  const assistantId = useRef<string | null>(null);
  const thoughtId = useRef<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await invoke<GrokStatus>("grok_status");
      setGrok(s);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    invoke<string>("default_cwd").then(setCwd).catch(() => {});
  }, [refreshStatus]);

  useEffect(() => {
    // React StrictMode remounts effects in dev. listen() is async, so a naive
    // cleanup can miss the first unlisten and leave *two* handlers → doubled
    // streaming text ("I'llI'll look look…"). Track cancellation carefully.
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
      setPermissions((prev) => [...prev, e.payload]);
    }).then(track);

    void listen<Record<string, unknown>>("acp://session-update", (e) => {
      const update = (e.payload?.update ?? e.payload) as Record<string, unknown>;
      const kind = (update?.sessionUpdate ?? update?.session_update) as
        | string
        | undefined;
      if (!kind) return;

      if (kind === "agent_message_chunk") {
        const chunk = extractText(update.content);
        if (!chunk) return;
        assistantBuf.current += chunk;
        const id = assistantId.current ?? uid();
        assistantId.current = id;
        const text = assistantBuf.current;
        setItems((prev) => {
          const rest = prev.filter((i) => i.id !== id);
          return [...rest, { id, role: "assistant", text }];
        });
      } else if (kind === "agent_thought_chunk") {
        const chunk = extractText(update.content);
        if (!chunk) return;
        thoughtBuf.current += chunk;
        const id = thoughtId.current ?? uid();
        thoughtId.current = id;
        const text = thoughtBuf.current;
        setItems((prev) => {
          const rest = prev.filter((i) => i.id !== id);
          return [
            ...rest,
            { id, role: "thought", text, meta: "thinking" },
          ];
        });
      } else if (kind === "tool_call") {
        const id =
          (update.toolCallId as string) ||
          (update.tool_call_id as string) ||
          uid();
        const title =
          (update.title as string) ||
          (update.tool as string) ||
          "tool";
        const status = (update.status as string) || "pending";
        setTools((prev) => {
          const others = prev.filter((t) => t.id !== id);
          return [
            ...others,
            {
              id,
              title,
              kind: update.kind as string | undefined,
              status,
              raw: update,
            },
          ];
        });
        // One transcript line per toolCallId; updates mutate status below.
        setItems((prev) => {
          const existing = prev.find((i) => i.id === `tool-${id}`);
          if (existing) {
            return prev.map((i) =>
              i.id === `tool-${id}`
                ? { ...i, text: title, meta: status, status }
                : i,
            );
          }
          return [
            ...prev,
            {
              id: `tool-${id}`,
              role: "tool",
              text: title,
              meta: status,
              status,
            },
          ];
        });
      } else if (kind === "tool_call_update") {
        const id =
          (update.toolCallId as string) ||
          (update.tool_call_id as string) ||
          "";
        const status = (update.status as string) || "updated";
        if (id) {
          setTools((prev) =>
            prev.map((t) => (t.id === id ? { ...t, status, raw: update } : t)),
          );
          setItems((prev) =>
            prev.map((i) =>
              i.id === `tool-${id}` ? { ...i, meta: status, status } : i,
            ),
          );
        }
      } else if (kind === "plan") {
        const entries = update.entries;
        setItems((prev) => [
          ...prev,
          {
            id: uid(),
            role: "system",
            text: `Plan: ${JSON.stringify(entries, null, 2)}`,
            meta: "plan",
          },
        ]);
      }
    }).then(track);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [items, permissions]);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const i = await invoke<AgentInfo>("agent_start");
      setInfo(i);
      setRunning(true);
      setItems((prev) => [
        ...prev,
        {
          id: uid(),
          role: "system",
          text: `Connected · ${i.modelId ?? "model"} · ${i.subscriptionTier ?? "auth ok"}`,
        },
      ]);
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
      setSession(null);
      setInfo(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const openSession = async () => {
    setError(null);
    try {
      const s = await invoke<SessionInfo>("session_new", { cwd });
      setSession(s);
      setTools([]);
      setItems((prev) => [
        ...prev,
        {
          id: uid(),
          role: "system",
          text: `Session ${s.sessionId.slice(0, 8)}… · ${s.cwd}`,
        },
      ]);
    } catch (e) {
      setError(String(e));
    }
  };

  const send = async () => {
    if (!prompt.trim() || busy) return;
    const text = prompt.trim();
    setPrompt("");
    setBusy(true);
    setError(null);
    assistantBuf.current = "";
    thoughtBuf.current = "";
    assistantId.current = null;
    thoughtId.current = null;
    setItems((prev) => [...prev, { id: uid(), role: "user", text }]);
    try {
      const result = await invoke<Record<string, unknown>>("session_prompt", {
        text,
      });
      const meta = (result?._meta ?? result) as Record<string, unknown> | undefined;
      const out =
        typeof meta?.outputTokens === "number"
          ? ` · ${meta.outputTokens} out tokens`
          : "";
      const model =
        typeof meta?.modelId === "string" ? ` · ${meta.modelId}` : "";
      setItems((prev) => [
        ...prev,
        {
          id: uid(),
          role: "system",
          text: `Turn complete${model}${out}`,
          meta: "stop",
        },
      ]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    try {
      await invoke("session_cancel");
    } catch (e) {
      setError(String(e));
    }
  };

  const respondPermission = async (
    requestId: number,
    optionId: string | null,
  ) => {
    try {
      await invoke("permission_respond", {
        requestId,
        optionId,
      });
      setPermissions((prev) => prev.filter((p) => p.requestId !== requestId));
    } catch (e) {
      setError(String(e));
    }
  };

  const headerStatus = useMemo(() => {
    if (!grok?.available) return "Grok CLI missing";
    if (!running) return "Disconnected";
    if (!session) return "Connected · no session";
    return `Session · ${session.modelId ?? info?.modelId ?? "—"}`;
  }, [grok, running, session, info]);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
          <span className="text-sm font-semibold tracking-wide">Grok Desk</span>
          <span className="text-xs text-[var(--text-muted)]">v0.1 · Phase 0</span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="mono">{headerStatus}</span>
          {info?.authEmail && (
            <span className="hidden sm:inline">{info.authEmail}</span>
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
        <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
          <div className="space-y-3 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Agent
            </div>
            {!running ? (
              <button
                onClick={connect}
                disabled={connecting || !grok?.available}
                className="w-full rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black transition hover:bg-[var(--accent-dim)] disabled:opacity-40"
              >
                {connecting ? "Connecting…" : "Connect to Grok"}
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
              >
                Disconnect
              </button>
            )}

            {!grok?.available && (
              <p className="text-xs leading-relaxed text-[var(--warning)]">
                Install Grok Build and ensure <code className="mono">grok</code> is
                on PATH.
              </p>
            )}

            <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Project folder
            </div>
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="mono w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
              placeholder="/path/to/project"
              spellCheck={false}
            />
            <button
              onClick={openSession}
              disabled={!running}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-40"
            >
              New session here
            </button>

            {session && (
              <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-xs">
                <div className="text-[var(--text-muted)]">session</div>
                <div className="mono break-all text-[var(--success)]">
                  {session.sessionId}
                </div>
              </div>
            )}
          </div>

          {/* Tools */}
          <div className="min-h-0 flex-1 overflow-auto border-t border-[var(--border)] p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Tool activity
            </div>
            {tools.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No tools yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {tools
                  .slice()
                  .reverse()
                  .map((t) => (
                    <li
                      key={t.id}
                      className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                    >
                      <div className="font-medium text-[var(--tool)]">{t.title}</div>
                      <div className="mono text-[10px] text-[var(--text-muted)]">
                        {t.status}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {stderrTail.length > 0 && (
            <details className="border-t border-[var(--border)] p-2 text-[10px] text-[var(--text-muted)]">
              <summary className="cursor-pointer">Agent stderr</summary>
              <pre className="mono mt-1 max-h-28 overflow-auto whitespace-pre-wrap">
                {stderrTail.slice(-12).join("\n")}
              </pre>
            </details>
          )}
        </aside>

        {/* Main */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Permissions */}
          {permissions.length > 0 && (
            <div className="space-y-2 border-b border-[var(--warning)]/40 bg-[#2a1f08] px-4 py-3">
              {permissions.map((p) => (
                <div key={p.requestId} className="rounded-md border border-[var(--warning)]/50 bg-[var(--bg)] p-3">
                  <div className="mb-1 text-xs font-semibold text-[var(--warning)]">
                    Permission required
                  </div>
                  <pre className="mono mb-2 max-h-24 overflow-auto text-[11px] text-[var(--text-muted)]">
                    {JSON.stringify(p.toolCall ?? p.raw, null, 2).slice(0, 800)}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    {p.options.map((o) => (
                      <button
                        key={o.optionId}
                        onClick={() => respondPermission(p.requestId, o.optionId)}
                        className="rounded bg-[var(--accent)] px-3 py-1 text-xs font-medium text-black hover:bg-[var(--accent-dim)]"
                      >
                        {o.name || o.optionId}
                        {o.kind ? ` (${o.kind})` : ""}
                      </button>
                    ))}
                    <button
                      onClick={() => respondPermission(p.requestId, null)}
                      className="rounded border border-[var(--danger)] px-3 py-1 text-xs text-[var(--danger)]"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Transcript */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-[var(--text-muted)]">
                <p className="text-lg font-medium text-[var(--text)]">
                  Grok Build, with a desk
                </p>
                <p className="mt-2 max-w-md text-sm leading-relaxed">
                  Connect → open a session on a project folder → prompt.
                  Tools, thoughts, and permission cards stream here.
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-3">
                {items.map((item) => (
                  <MessageBubble key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="border-t border-[var(--danger)]/40 bg-[#2a1018] px-4 py-2 text-xs text-[var(--danger)]">
              {error}
            </div>
          )}

          {/* Composer */}
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
                disabled={!session || busy}
                rows={2}
                placeholder={
                  !running
                    ? "Connect to Grok first…"
                    : !session
                      ? "Create a session on a project folder…"
                      : "Message Grok… (Enter to send, Shift+Enter for newline)"
                }
                className="min-h-[52px] flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-50"
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={send}
                  disabled={!session || busy || !prompt.trim()}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
                >
                  {busy ? "…" : "Send"}
                </button>
                {busy && (
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
        </main>
      </div>
    </div>
  );
}

function MessageBubble({ item }: { item: ChatItem }) {
  if (item.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent-dim)]/30 px-3.5 py-2 text-sm leading-relaxed">
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
          <span className="text-[var(--text-muted)]">· {item.meta}</span>
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
    <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bg-panel)] px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
      {item.text}
    </div>
  );
}
