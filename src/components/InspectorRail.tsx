import type { ReactNode } from "react";

export type InspectorTab = "plan" | "diff";

type Props = {
  tab: InspectorTab | null;
  onTab: (tab: InspectorTab | null) => void;
  planBadge?: string | null;
  planAlert?: boolean;
  diffBadge?: string | null;
  children: ReactNode;
};

/**
 * Chat-first right rail: slim icon strip when closed,
 * single tabbed panel when open (Plan XOR Diff).
 */
export function InspectorRail({
  tab,
  onTab,
  planBadge,
  planAlert,
  diffBadge,
  children,
}: Props) {
  const open = tab !== null;

  const toggle = (t: InspectorTab) => {
    onTab(tab === t ? null : t);
  };

  return (
    <div className="flex h-full shrink-0">
      {/* Icon strip — always visible */}
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
        <div className="mt-auto flex flex-col items-center gap-1 pb-1">
          <span
            className="text-[9px] leading-none text-[var(--text-faint)]"
            title="Alt+P Plan · Alt+D Diff · Ctrl+/ shortcuts"
          >
            ⌥
          </span>
        </div>
      </div>

      {open && (
        <div className="rail-enter flex w-[min(24rem,38vw)] min-w-[18rem] flex-col border-l border-[var(--border)] bg-[var(--bg-panel)] shadow-[-8px_0_24px_rgba(0,0,0,0.2)]">
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
            <button
              type="button"
              onClick={() => onTab(null)}
              className="ml-auto mr-1.5 rounded-md px-2 py-1 text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              title="Close panel (Esc)"
            >
              ✕
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
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
      } ${alert && !active ? "animate-pulse" : ""}`}
      style={active ? { color: accent } : undefined}
    >
      <span>{label[0]}</span>
      {badge ? (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-black"
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
      className={`relative px-3.5 py-2.5 text-[12px] font-semibold tracking-wide transition ${
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
