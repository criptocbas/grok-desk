import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

type PtySpawnResult = {
  ptyId: string;
  sessionId: string;
  cwd: string;
};

type PtyDataEvent = {
  ptyId: string;
  sessionId: string;
  data: string;
};

type PtyExitEvent = {
  ptyId: string;
  sessionId: string;
  code: number | null;
};

type PtyInfo = {
  ptyId: string;
  sessionId: string;
  cwd: string;
  alive: boolean;
};

type Props = {
  sessionId: string;
  cwd: string;
  /** When false, component unmounts or stays mounted but hidden — keep PTY alive. */
  active: boolean;
  onFocusChange?: (focused: boolean) => void;
  onClose?: () => void;
};

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readCssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Project shell for one Desk session — human PTY, not ACP agent terminal.
 * Streams into xterm only; never stores scrollback in React state.
 */
export function TerminalPane({
  sessionId,
  cwd,
  active,
  onFocusChange,
  onClose,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const [status, setStatus] = useState<"starting" | "running" | "exited" | "error">(
    "starting",
  );
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spawnCwd, setSpawnCwd] = useState(cwd);

  const fit = useCallback(() => {
    const f = fitRef.current;
    const t = termRef.current;
    const id = ptyIdRef.current;
    if (!f || !t) return;
    try {
      f.fit();
      if (id && t.cols > 0 && t.rows > 0) {
        void invoke("pty_resize", {
          ptyId: id,
          cols: t.cols,
          rows: t.rows,
        }).catch(() => {
          /* shell may have exited */
        });
      }
    } catch {
      /* host not laid out yet */
    }
  }, []);

  const attachOrSpawn = useCallback(async () => {
    setError(null);
    setExitCode(null);
    setStatus("starting");
    try {
      // Reuse alive shell for this session if present
      const listed = await invoke<PtyInfo[]>("pty_list", { sessionId });
      const existing = listed.find((p) => p.alive);
      let ptyId: string;
      let shellCwd = cwd;
      if (existing) {
        ptyId = existing.ptyId;
        shellCwd = existing.cwd;
      } else {
        const term = termRef.current;
        const cols = term?.cols || 80;
        const rows = term?.rows || 24;
        const spawned = await invoke<PtySpawnResult>("pty_spawn", {
          sessionId,
          cwd,
          cols,
          rows,
        });
        ptyId = spawned.ptyId;
        shellCwd = spawned.cwd;
      }
      ptyIdRef.current = ptyId;
      setSpawnCwd(shellCwd);
      setStatus("running");
      // Fit after spawn so PTY matches the panel
      requestAnimationFrame(() => fit());
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  }, [sessionId, cwd, fit]);

  const restart = useCallback(async () => {
    const id = ptyIdRef.current;
    if (id) {
      try {
        await invoke("pty_kill", { ptyId: id });
      } catch {
        /* ignore */
      }
      ptyIdRef.current = null;
    }
    termRef.current?.reset();
    await attachOrSpawn();
  }, [attachOrSpawn]);

  // Create xterm once per mount
  useEffect(() => {
    if (!hostRef.current || termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily:
        '"IBM Plex Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      scrollback: 5000,
      theme: {
        background: readCssVar("--bg", "#0a0a0b"),
        foreground: readCssVar("--text", "#e8e8ea"),
        cursor: readCssVar("--accent", "#d4a05a"),
        cursorAccent: readCssVar("--bg", "#0a0a0b"),
        selectionBackground: "rgba(212, 160, 90, 0.35)",
        black: "#1a1a1c",
        red: "#f2556e",
        green: "#4ecf8e",
        yellow: "#e8b84a",
        blue: "#6b9fff",
        magenta: "#a78bfa",
        cyan: "#4ecdc4",
        white: "#e8e8ea",
        brightBlack: "#636368",
        brightRed: "#ff7a8c",
        brightGreen: "#6ee0a8",
        brightYellow: "#f0cc6a",
        brightBlue: "#8fb4ff",
        brightMagenta: "#c4b0ff",
        brightCyan: "#7ee0d8",
        brightWhite: "#f5f5f6",
      },
      allowProposedApi: false,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(hostRef.current);
    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;

    const dataDisp = term.onData((data) => {
      const id = ptyIdRef.current;
      if (!id) return;
      void invoke("pty_write", { ptyId: id, data }).catch(() => {
        /* dead shell */
      });
    });

    const onFocus = () => onFocusChange?.(true);
    const onBlur = () => onFocusChange?.(false);
    term.textarea?.addEventListener("focus", onFocus);
    term.textarea?.addEventListener("blur", onBlur);

    // Spawn after terminal exists
    void attachOrSpawn();

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => fit());
    });
    ro.observe(hostRef.current);

    return () => {
      dataDisp.dispose();
      term.textarea?.removeEventListener("focus", onFocus);
      term.textarea?.removeEventListener("blur", onBlur);
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      // Do NOT kill PTY on unmount — session switch may remount; kill is App's job.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per session pane instance
  }, [sessionId]);

  // Global pty listeners
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let cancelled = false;

    void (async () => {
      const u1 = await listen<PtyDataEvent>("pty://data", (e) => {
        if (e.payload.sessionId !== sessionIdRef.current) return;
        if (ptyIdRef.current && e.payload.ptyId !== ptyIdRef.current) return;
        const term = termRef.current;
        if (!term) return;
        try {
          term.write(b64ToUint8(e.payload.data));
        } catch {
          /* ignore decode */
        }
      });
      if (cancelled) {
        u1();
        return;
      }
      unlisteners.push(u1);

      const u2 = await listen<PtyExitEvent>("pty://exit", (e) => {
        if (e.payload.sessionId !== sessionIdRef.current) return;
        if (ptyIdRef.current && e.payload.ptyId !== ptyIdRef.current) return;
        setStatus("exited");
        setExitCode(e.payload.code);
      });
      if (cancelled) {
        u2();
        return;
      }
      unlisteners.push(u2);
    })();

    return () => {
      cancelled = true;
      for (const u of unlisteners) u();
    };
  }, [sessionId]);

  // When panel becomes active, re-fit and focus
  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      fit();
      termRef.current?.focus();
    });
  }, [active, fit]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            status === "running"
              ? "bg-[var(--success)]"
              : status === "starting"
                ? "status-pulse bg-[var(--warning)]"
                : status === "error"
                  ? "bg-[var(--danger)]"
                  : "bg-[var(--text-faint)]"
          }`}
          aria-hidden
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          Shell
        </span>
        <span
          className="mono min-w-0 flex-1 truncate text-[10px] text-[var(--text-muted)]"
          title={spawnCwd}
        >
          {spawnCwd}
        </span>
        {status === "exited" && (
          <span className="mono shrink-0 text-[10px] text-[var(--text-faint)]">
            exit {exitCode ?? "?"}
          </span>
        )}
        <button
          type="button"
          onClick={() => void restart()}
          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          title="Restart shell in session project folder"
        >
          Restart
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            title="Hide terminal (Ctrl+`)"
          >
            ✕
          </button>
        )}
      </div>
      {error && (
        <div className="shrink-0 border-b border-[var(--danger)]/30 bg-[var(--bg-danger-subtle)] px-2 py-1 text-[11px] text-[var(--danger)]">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void restart()}
          >
            Retry
          </button>
        </div>
      )}
      {status === "exited" && !error && (
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
          Shell exited.{" "}
          <button
            type="button"
            className="text-[var(--accent)] underline"
            onClick={() => void restart()}
          >
            Restart
          </button>
        </div>
      )}
      <div
        ref={hostRef}
        className="min-h-0 flex-1 overflow-hidden px-1 py-0.5"
        data-grok-terminal="1"
        onMouseDown={() => {
          termRef.current?.focus();
          onFocusChange?.(true);
        }}
      />
    </div>
  );
}
