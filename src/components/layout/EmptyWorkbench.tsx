type Props = {
  running: boolean;
  connecting: boolean;
  grokAvailable: boolean;
  onConnect: () => void;
};

export function EmptyWorkbench({
  running,
  connecting,
  grokAvailable,
  onConnect,
}: Props) {
  return (
    <div className="fade-up flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] text-xl text-[var(--accent)]">
        ⌂
      </div>
      <div className="space-y-2">
        <p className="text-xl font-semibold tracking-tight text-[var(--text)]">
          Mission control for Grok Build
        </p>
        <p className="mx-auto max-w-md text-[13px] leading-relaxed text-[var(--text-muted)]">
          Chat-first layout. Plan and Diff stay in the right rail until you need
          them — open with the toolbar or <span className="kbd">Alt</span>+
          <span className="kbd">P</span> / <span className="kbd">D</span>.
        </p>
      </div>
      <ol className="mx-auto max-w-sm space-y-1.5 text-left text-[12px] text-[var(--text-muted)]">
        <li className="flex gap-2">
          <span className="mono text-[var(--accent)]">1</span>
          Connect to the local <span className="mono">grok</span> agent
        </li>
        <li className="flex gap-2">
          <span className="mono text-[var(--accent)]">2</span>
          Choose a project folder
        </li>
        <li className="flex gap-2">
          <span className="mono text-[var(--accent)]">3</span>
          Open a session and steer with model, effort, and perms
        </li>
      </ol>
      {!running && (
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting || !grokAvailable}
          className="mt-1 rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-40"
        >
          {connecting ? "Connecting…" : "Connect to Grok"}
        </button>
      )}
      {running && (
        <p className="text-[12px] text-[var(--text-faint)]">
          Pick a folder and click <strong>+ New session</strong>
        </p>
      )}
    </div>
  );
}
