import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export type InspectorTab = "plan" | "diff" | "activity" | "settings";

const LAYOUT_KEY = "grok-desk.layout.v1";
const DEFAULT_WIDTH = 384;
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;

type LayoutPrefs = {
  utilityWidth?: number;
};

function loadWidth(): number {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const parsed = JSON.parse(raw) as LayoutPrefs;
    const w = parsed.utilityWidth;
    if (typeof w === "number" && w >= MIN_WIDTH && w <= MAX_WIDTH) return w;
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH;
}

function saveWidth(width: number) {
  try {
    let prev: LayoutPrefs = {};
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) prev = JSON.parse(raw) as LayoutPrefs;
    localStorage.setItem(
      LAYOUT_KEY,
      JSON.stringify({ ...prev, utilityWidth: width }),
    );
  } catch {
    /* ignore */
  }
}

type Props = {
  tab: InspectorTab | null;
  onTab: (tab: InspectorTab | null) => void;
  planBadge?: string | null;
  planAlert?: boolean;
  diffBadge?: string | null;
  activityBadge?: string | null;
  activityAlert?: boolean;
  children: ReactNode;
};

/**
 * Right utility rail: icon strip when closed; resizable tabbed panel when open.
 * Tabs: Plan · Diff · Activity · Settings.
 */
export function InspectorRail({
  tab,
  onTab,
  planBadge,
  planAlert,
  diffBadge,
  activityBadge,
  activityAlert,
  children,
}: Props) {
  const open = tab !== null;
  const [width, setWidth] = useState(loadWidth);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    saveWidth(width);
  }, [width]);

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: width };
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        // Dragging left edge: move left → wider
        const delta = dragRef.current.startX - ev.clientX;
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, dragRef.current.startW + delta),
        );
        setWidth(next);
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
    [width],
  );

  const toggle = (t: InspectorTab) => {
    onTab(tab === t ? null : t);
  };

  return (
    <div className="flex h-full shrink-0">
      <div className="flex w-11 flex-col items-center gap-1 border-l border-[var(--border)] bg-[var(--bg-elevated)] py-2">
        <RailBtn
          active={tab === "plan"}
          alert={planAlert}
          badge={planBadge}
          label="Plan"
          shortcut="P"
          onClick={() => toggle("plan")}
          accent="var(--accent)"
        />
        <RailBtn
          active={tab === "diff"}
          badge={diffBadge}
          label="Diff"
          shortcut="D"
          onClick={() => toggle("diff")}
          accent="var(--tool)"
        />
        <RailBtn
          active={tab === "activity"}
          alert={activityAlert}
          badge={activityBadge}
          label="Activity"
          shortcut="A"
          onClick={() => toggle("activity")}
          accent="var(--warning)"
        />
        <RailBtn
          active={tab === "settings"}
          label="Settings"
          shortcut=","
          onClick={() => toggle("settings")}
          accent="var(--text-muted)"
        />
        <div className="mt-auto flex flex-col items-center gap-1 pb-1">
          <span
            className="text-[9px] leading-none text-[var(--text-faint)]"
            title="Alt+P Plan · Alt+D Diff · Alt+A Activity · Ctrl+/ shortcuts"
          >
            ⌥
          </span>
        </div>
      </div>

      {open && (
        <div
          className="rail-enter relative flex min-w-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)] shadow-[-8px_0_24px_rgba(0,0,0,0.2)]"
          style={{ width }}
        >
          {/* Resize handle — left edge */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize utility panel"
            onPointerDown={onResizePointerDown}
            className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize hover:bg-[var(--accent)]/40 active:bg-[var(--accent)]/60"
          />

          <div className="flex items-center gap-0 border-b border-[var(--border)]">
            <Tab
              active={tab === "plan"}
              onClick={() => onTab("plan")}
              color="var(--accent)"
            >
              Plan
              {planBadge ? (
                <span className="mono ml-1.5 text-[10px] opacity-70">
                  {planBadge}
                </span>
              ) : null}
            </Tab>
            <Tab
              active={tab === "diff"}
              onClick={() => onTab("diff")}
              color="var(--tool)"
            >
              Diff
              {diffBadge ? (
                <span className="mono ml-1.5 text-[10px] opacity-70">
                  {diffBadge}
                </span>
              ) : null}
            </Tab>
            <Tab
              active={tab === "activity"}
              onClick={() => onTab("activity")}
              color="var(--warning)"
            >
              Activity
              {activityBadge ? (
                <span className="mono ml-1.5 text-[10px] opacity-70">
                  {activityBadge}
                </span>
              ) : null}
            </Tab>
            <Tab
              active={tab === "settings"}
              onClick={() => onTab("settings")}
              color="var(--text-muted)"
            >
              Settings
            </Tab>
            <button
              type="button"
              onClick={() => onTab(null)}
              className="ml-auto mr-1.5 rounded-md px-2 py-1 text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              title="Close panel (Esc)"
            >
              ✕
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function RailBtn({
  active,
  alert,
  badge,
  label,
  shortcut,
  onClick,
  accent,
}: {
  active: boolean;
  alert?: boolean;
  badge?: string | null;
  label: string;
  shortcut: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} (Alt+${shortcut})`}
      className={`group relative flex h-10 w-9 flex-col items-center justify-center rounded-md text-[10px] font-semibold tracking-wide transition ${
        active
          ? "bg-[var(--bg-active)]"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
      } ${alert && !active ? "status-pulse" : ""}`}
      style={active ? { color: accent } : undefined}
    >
      <span>{label[0]}</span>
      {badge ? (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-[var(--accent-fg)]"
          style={{ background: accent }}
        >
          {badge.length > 3 ? "•" : badge}
        </span>
      ) : null}
      {alert && !badge ? (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
      ) : null}
    </button>
  );
}

function Tab({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-2.5 py-2.5 text-[11px] font-semibold tracking-wide transition sm:px-3 sm:text-[12px] ${
        active ? "" : "text-[var(--text-muted)] hover:text-[var(--text)]"
      }`}
      style={active ? { color } : undefined}
    >
      {children}
      {active && (
        <span
          className="absolute inset-x-2 bottom-0 h-0.5 rounded-full"
          style={{ background: color }}
        />
      )}
    </button>
  );
}
