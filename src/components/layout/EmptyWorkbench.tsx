import type { DiskSession, SessionPin } from "../../types";
import { folderName, formatTime, shortId } from "../../lib/format";

type Props = {
  running: boolean;
  connecting: boolean;
  grokAvailable: boolean;
  onConnect: () => void;
  /** Project folder currently selected in the navigator. */
  cwd?: string;
  onNewSession?: () => void;
  onBrowseFolder?: () => void;
  pins?: SessionPin[];
  onResumePin?: (pin: SessionPin) => void;
  diskSessions?: DiskSession[];
  onResumeDisk?: (d: DiskSession) => void;
};

export function EmptyWorkbench({
  running,
  connecting,
  grokAvailable,
  onConnect,
  cwd,
  onNewSession,
  onBrowseFolder,
  pins = [],
  onResumePin,
  diskSessions = [],
  onResumeDisk,
}: Props) {
  const livePins = pins.filter((p) => !p.missing).slice(0, 5);
  const recents = diskSessions.slice(0, 5);

  return (
    <div className="fade-up flex flex-1 flex-col items-center justify-center gap-5 p-10 text-center">
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
          <span className="kbd">P</span> / <span className="kbd">D</span>. Press{" "}
          <span className="kbd">Ctrl</span>+<span className="kbd">K</span> for
          the command palette.
        </p>
      </div>

      {!running ? (
        <>
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
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting || !grokAvailable}
            className="mt-1 rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-40"
          >
            {connecting ? "Connecting…" : "Connect to Grok"}
          </button>
        </>
      ) : (
        <div className="flex w-full max-w-md flex-col items-stretch gap-4">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onNewSession}
              disabled={!cwd}
              title={cwd ? `New session in ${cwd}` : "Pick a project folder first"}
              className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-40"
            >
              + New session
            </button>
            <button
              type="button"
              onClick={onBrowseFolder}
              className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
            >
              Choose folder…
            </button>
          </div>
          {cwd && (
            <p className="mono truncate text-[11px] text-[var(--text-faint)]" title={cwd}>
              {cwd}
            </p>
          )}

          {livePins.length > 0 && onResumePin && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-3 text-left">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Pinned
              </div>
              <ul className="space-y-0.5">
                {livePins.map((p) => (
                  <li key={`${p.sessionId}:${p.cwd}`}>
                    <button
                      type="button"
                      onClick={() => onResumePin(p)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                    >
                      <span className="text-[10px] text-[var(--accent)]" aria-hidden>
                        📌
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium text-[var(--text)]">
                          {p.title || folderName(p.cwd)}
                        </div>
                        <div className="mono truncate text-[10px] text-[var(--text-faint)]">
                          {folderName(p.cwd)} · {shortId(p.sessionId)}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recents.length > 0 && onResumeDisk && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-3 text-left">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Recent
              </div>
              <ul className="space-y-0.5">
                {recents.map((d) => (
                  <li key={d.sessionId}>
                    <button
                      type="button"
                      onClick={() => onResumeDisk(d)}
                      className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                    >
                      <span className="truncate text-[12px] font-medium text-[var(--text)]">
                        {d.title || folderName(d.cwd)}
                      </span>
                      <span className="mono truncate text-[10px] text-[var(--text-faint)]">
                        {folderName(d.cwd)} · {formatTime(d.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
