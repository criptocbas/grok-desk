import { useEffect, useId, useRef, useState } from "react";
import type { PermissionRequest } from "../../types";
import {
  permissionOptionStyle,
  summarizePermissionToolCall,
  type PermissionRisk,
} from "../../lib/permissionSummary";

type Props = {
  permissions: PermissionRequest[];
  sessionId: string;
  onRespond: (
    sessionId: string,
    requestId: number,
    optionId: string | null,
  ) => void;
};

function riskClasses(risk: PermissionRisk): {
  badge: string;
  border: string;
} {
  switch (risk) {
    case "high":
      return {
        badge: "bg-[var(--danger)]/15 text-[var(--danger)]",
        border: "border-[var(--danger)]/45",
      };
    case "low":
      return {
        badge: "bg-[var(--success)]/12 text-[var(--success)]",
        border: "border-[var(--warning)]/40",
      };
    default:
      return {
        badge: "bg-[var(--warning)]/15 text-[var(--warning)]",
        border: "border-[var(--warning)]/50",
      };
  }
}

function optionButtonClass(style: ReturnType<typeof permissionOptionStyle>) {
  switch (style) {
    case "allow":
      return "rounded-md bg-[var(--success)] px-3 py-1.5 text-xs font-medium text-[var(--success-fg)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
    case "allow-always":
      return "rounded-md border border-[var(--warning)]/50 bg-[var(--warning)]/12 px-3 py-1.5 text-xs font-medium text-[var(--warning)] hover:bg-[var(--warning)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
    case "deny":
      return "rounded-md border border-[var(--danger)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
    default:
      return "rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-fg)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  }
}

function PermissionCard({
  p,
  sessionId,
  onRespond,
  autoFocus,
}: {
  p: PermissionRequest;
  sessionId: string;
  onRespond: Props["onRespond"];
  autoFocus: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const firstBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const summary = summarizePermissionToolCall(p.toolCall, p.raw);
  const risk = riskClasses(summary.risk);
  const rawJson = JSON.stringify(p.toolCall ?? p.raw, null, 2).slice(0, 2000);

  useEffect(() => {
    if (!autoFocus) return;
    requestAnimationFrame(() => firstBtnRef.current?.focus());
  }, [autoFocus, p.requestId]);

  // Prefer non-deny options first for focus, keep original order for display
  const primaryOption = p.options.find((o) => {
    const st = permissionOptionStyle(o.kind, o.name || o.optionId);
    return st === "allow" || st === "allow-always" || st === "neutral";
  });

  return (
    <div
      className={`rounded-md border bg-[var(--bg)] p-3 ${risk.border}`}
      role="group"
      aria-labelledby={titleId}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            id={titleId}
            className="text-xs font-semibold text-[var(--warning)]"
          >
            Permission required
          </div>
          <div className="mt-1 text-[13px] font-medium leading-snug text-[var(--text)]">
            {summary.title}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${risk.badge}`}
          title="Estimated impact — agent still enforces hooks/denies"
        >
          {summary.riskLabel}
        </span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
        {summary.toolName && (
          <span className="mono rounded bg-[var(--bg-panel)] px-1.5 py-0.5 text-[10px] text-[var(--tool)]">
            {summary.toolName}
          </span>
        )}
        {summary.kind && (
          <span className="mono text-[10px] text-[var(--text-faint)]">
            {summary.kind}
          </span>
        )}
      </div>

      {summary.detail && (
        <div
          className="mono mb-2 max-h-16 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1.5 text-[11px] leading-relaxed text-[var(--text)]"
          title={summary.detail}
        >
          {summary.detail}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {p.options.map((o) => {
          const style = permissionOptionStyle(o.kind, o.name || o.optionId);
          const isPrimary = primaryOption?.optionId === o.optionId;
          return (
            <button
              key={o.optionId}
              ref={isPrimary ? firstBtnRef : undefined}
              type="button"
              onClick={() => onRespond(sessionId, p.requestId, o.optionId)}
              className={optionButtonClass(style)}
            >
              {o.name || o.optionId}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onRespond(sessionId, p.requestId, null)}
          className={optionButtonClass("deny")}
        >
          Deny
        </button>
      </div>

      <div className="mt-2 border-t border-[var(--border)]/70 pt-1.5">
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-[10px] font-medium text-[var(--text-faint)] hover:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-expanded={showRaw}
        >
          {showRaw ? "Hide raw JSON" : "Show raw JSON"}
        </button>
        {showRaw && (
          <pre className="mono mt-1.5 max-h-32 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-panel)] p-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            {rawJson}
          </pre>
        )}
      </div>
    </div>
  );
}

export function PermissionBanner({
  permissions,
  sessionId,
  onRespond,
}: Props) {
  if (permissions.length === 0) return null;

  return (
    <div
      className="space-y-2 border-b border-[var(--warning)]/40 bg-[var(--bg-warning-subtle)] px-4 py-3"
      role="alertdialog"
      aria-label="Permission required"
      aria-live="assertive"
    >
      {permissions.map((p, i) => (
        <PermissionCard
          key={p.requestId}
          p={p}
          sessionId={sessionId}
          onRespond={onRespond}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}
