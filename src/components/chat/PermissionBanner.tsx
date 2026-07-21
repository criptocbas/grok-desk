import type { PermissionRequest } from "../../types";

type Props = {
  permissions: PermissionRequest[];
  sessionId: string;
  onRespond: (
    sessionId: string,
    requestId: number,
    optionId: string | null,
  ) => void;
};

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
    >
      {permissions.map((p) => (
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
                type="button"
                onClick={() => onRespond(sessionId, p.requestId, o.optionId)}
                className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-[var(--accent-fg)]"
              >
                {o.name || o.optionId}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onRespond(sessionId, p.requestId, null)}
              className="rounded border border-[var(--danger)] px-3 py-1 text-xs text-[var(--danger)]"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
