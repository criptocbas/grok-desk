import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { TerminalPane } from "./TerminalPane";

const LAYOUT_KEY = "grok-desk.layout.v1";
const DEFAULT_HEIGHT = 220;
const MIN_HEIGHT = 120;
const MAX_HEIGHT_VH = 0.45;

type LayoutPrefs = {
  utilityWidth?: number;
  terminalHeight?: number;
  terminalOpen?: boolean;
};

function loadPrefs(): { height: number; open: boolean } {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return { height: DEFAULT_HEIGHT, open: false };
    const parsed = JSON.parse(raw) as LayoutPrefs;
    const h =
      typeof parsed.terminalHeight === "number" &&
      parsed.terminalHeight >= MIN_HEIGHT
        ? parsed.terminalHeight
        : DEFAULT_HEIGHT;
    return {
      height: h,
      open: parsed.terminalOpen === true,
    };
  } catch {
    return { height: DEFAULT_HEIGHT, open: false };
  }
}

function savePrefs(height: number, open: boolean) {
  try {
    let prev: LayoutPrefs = {};
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) prev = JSON.parse(raw) as LayoutPrefs;
    localStorage.setItem(
      LAYOUT_KEY,
      JSON.stringify({
        ...prev,
        terminalHeight: height,
        terminalOpen: open,
      }),
    );
  } catch {
    /* ignore */
  }
}

type Props = {
  sessionId: string;
  cwd: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTerminalFocusChange?: (focused: boolean) => void;
};

/**
 * Bottom workbench dock: collapsed strip or resizable project shell.
 */
export function TerminalDock({
  sessionId,
  cwd,
  open,
  onOpenChange,
  onTerminalFocusChange,
}: Props) {
  const initial = useRef(loadPrefs());
  const [height, setHeight] = useState(initial.current.height);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    savePrefs(height, open);
  }, [height, open]);

  // Sync open from parent without fighting first paint
  useEffect(() => {
    // Parent owns open; we only persist.
  }, [open]);

  const clampHeight = useCallback((h: number) => {
    const max = Math.floor(window.innerHeight * MAX_HEIGHT_VH);
    return Math.min(max, Math.max(MIN_HEIGHT, h));
  }, []);

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: height };
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        // Drag handle is top of terminal: drag up → taller
        const delta = dragRef.current.startY - ev.clientY;
        setHeight(clampHeight(dragRef.current.startH + delta));
      };
      const onUp = (ev: PointerEvent) => {
        dragRef.current = null;
        target.releasePointerCapture(ev.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [height, clampHeight],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="flex w-full shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-left text-[10px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
        title="Open project shell (Ctrl+`)"
      >
        <span className="font-semibold uppercase tracking-wide">Terminal</span>
        <span className="mono truncate text-[var(--text-faint)]">{cwd}</span>
        <span className="ml-auto shrink-0">
          <span className="kbd">Ctrl</span>+
          <span className="kbd">`</span>
        </span>
      </button>
    );
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-t border-[var(--border)]"
      style={{ height }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
        onPointerDown={onResizePointerDown}
        className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-row-resize hover:bg-[var(--accent)]/40 active:bg-[var(--accent)]/60"
      />
      <div className="min-h-0 flex-1 pt-0.5">
        <TerminalPane
          sessionId={sessionId}
          cwd={cwd}
          active={open}
          onFocusChange={onTerminalFocusChange}
          onClose={() => {
            onTerminalFocusChange?.(false);
            onOpenChange(false);
          }}
        />
      </div>
    </div>
  );
}

/** Load whether terminal was open last session (for App initial state). */
export function loadTerminalOpen(): boolean {
  return loadPrefs().open;
}
