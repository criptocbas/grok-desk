import { useEffect, useMemo, useRef, useState } from "react";
import type { GitFileStatus, ReviewComment } from "../types";

type Props = {
  /** When true, fill parent (no outer toggle chrome). */
  embedded?: boolean;
  open?: boolean;
  onToggle?: () => void;
  isRepo: boolean | null;
  files: GitFileStatus[];
  selectedPath: string | null;
  patch: string;
  error: string | null;
  loading: boolean;
  comments: ReviewComment[];
  onSelectFile: (path: string) => void;
  onRefresh: () => void;
  onAddComment: (comment: Omit<ReviewComment, "id">) => void;
  onRemoveComment: (id: string) => void;
};

function statusColor(s: string) {
  if (s.includes("?")) return "text-[var(--warning)]";
  if (s.includes("D")) return "text-[var(--danger)]";
  if (s.includes("A")) return "text-[var(--success)]";
  return "text-[var(--tool)]";
}

type DiffLine = {
  text: string;
  kind: "meta" | "add" | "del" | "ctx" | "hunk";
  newLine: number | null;
  /** Hunk index for collapse (null for non-hunk-body lines before first hunk). */
  hunkIndex: number | null;
};

/** Parse unified diff into line objects for click-to-comment + hunk collapse. */
function parseDiffLines(patch: string): DiffLine[] {
  const out: DiffLine[] = [];
  let newLine = 0;
  let hunkIndex = -1;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      const m = line.match(/\+(\d+)/);
      newLine = m ? parseInt(m[1], 10) : newLine;
      hunkIndex += 1;
      out.push({ text: line, kind: "hunk", newLine: null, hunkIndex });
      continue;
    }
    if (
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      out.push({ text: line, kind: "meta", newLine: null, hunkIndex: null });
      continue;
    }
    const hi = hunkIndex >= 0 ? hunkIndex : null;
    if (line.startsWith("+")) {
      out.push({ text: line, kind: "add", newLine, hunkIndex: hi });
      newLine += 1;
      continue;
    }
    if (line.startsWith("-")) {
      out.push({ text: line, kind: "del", newLine: null, hunkIndex: hi });
      continue;
    }
    if (line.startsWith("\\")) {
      out.push({ text: line, kind: "meta", newLine: null, hunkIndex: hi });
      continue;
    }
    out.push({ text: line, kind: "ctx", newLine, hunkIndex: hi });
    newLine += 1;
  }
  return out;
}

export function DiffPane({
  embedded = false,
  open = true,
  onToggle,
  isRepo,
  files,
  selectedPath,
  patch,
  error,
  loading,
  comments,
  onSelectFile,
  onRefresh,
  onAddComment,
  onRemoveComment,
}: Props) {
  const [draft, setDraft] = useState("");
  const [anchor, setAnchor] = useState<{
    line: number;
    snippet: string;
  } | null>(null);
  /** Hunk indexes that are collapsed. */
  const [collapsedHunks, setCollapsedHunks] = useState<Set<number>>(
    () => new Set(),
  );
  const fileListRef = useRef<HTMLUListElement>(null);

  const lines = useMemo(() => parseDiffLines(patch), [patch]);
  const hunkCount = useMemo(
    () => lines.filter((l) => l.kind === "hunk").length,
    [lines],
  );

  // Reset collapse when patch changes
  useEffect(() => {
    setCollapsedHunks(new Set());
    setAnchor(null);
    setDraft("");
  }, [selectedPath, patch]);

  const fileComments = selectedPath
    ? comments.filter((c) => c.path === selectedPath)
    : [];

  const toggleHunk = (idx: number) => {
    setCollapsedHunks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const collapseAllHunks = () => {
    const all = new Set<number>();
    for (let i = 0; i < hunkCount; i++) all.add(i);
    setCollapsedHunks(all);
  };

  const expandAllHunks = () => setCollapsedHunks(new Set());

  const selectFileByDelta = (delta: number) => {
    if (files.length === 0) return;
    const idx = selectedPath
      ? files.findIndex((f) => f.path === selectedPath)
      : -1;
    const next = Math.max(0, Math.min(files.length - 1, (idx < 0 ? 0 : idx) + delta));
    setAnchor(null);
    setDraft("");
    onSelectFile(files[next].path);
  };

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] p-2.5">
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[11px] hover:border-[var(--tool)] disabled:opacity-40"
          title="Refresh git status and selected file patch"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <span className="text-[10px] text-[var(--text-faint)]">
          Auto after writes
        </span>
        {files.length > 0 && (
          <span className="mono ml-auto text-[10px] text-[var(--tool)]">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {isRepo === false && (
          <div className="space-y-2 p-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
            <p className="font-medium text-[var(--text)]">Not a git repository</p>
            <p>
              Open a session in a project with a <span className="mono">.git</span>{" "}
              folder to review changes and leave review notes.
            </p>
            <p className="text-[11px]">
              Shortcut: <span className="kbd">Alt</span>
              <span className="mx-0.5 text-[var(--text-faint)]">+</span>
              <span className="kbd">D</span>
            </p>
          </div>
        )}
        {error && (
          <p className="px-3 py-2 text-[11px] text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}
        {isRepo && files.length === 0 && !error && !loading && (
          <div className="space-y-2 p-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
            <p className="font-medium text-[var(--success)]">Working tree clean</p>
            <p>
              No uncommitted changes. When the agent edits files, they appear here
              automatically.
            </p>
            <p className="text-[11px]">
              Shortcut: <span className="kbd">Alt</span>
              <span className="mx-0.5 text-[var(--text-faint)]">+</span>
              <span className="kbd">D</span>
            </p>
          </div>
        )}
        {isRepo && loading && files.length === 0 && (
          <p className="p-3 text-[12px] text-[var(--text-faint)]">Loading git status…</p>
        )}

        {files.length > 0 && (
          <ul
            ref={fileListRef}
            className="max-h-36 shrink-0 overflow-y-auto border-b border-[var(--border)] p-1"
            role="listbox"
            aria-label="Changed files"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                selectFileByDelta(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                selectFileByDelta(-1);
              } else if (e.key === "j") {
                e.preventDefault();
                selectFileByDelta(1);
              } else if (e.key === "k") {
                e.preventDefault();
                selectFileByDelta(-1);
              }
            }}
          >
            {files.map((f) => (
              <li key={f.path}>
                <button
                  role="option"
                  aria-selected={selectedPath === f.path}
                  onClick={() => {
                    setAnchor(null);
                    setDraft("");
                    onSelectFile(f.path);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] ${
                    selectedPath === f.path
                      ? "bg-[var(--tool)]/12"
                      : "hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <span
                    className={`mono w-6 shrink-0 ${statusColor(f.status)}`}
                    title={f.status}
                  >
                    {f.status}
                  </span>
                  <span className="mono truncate text-[var(--text)]">
                    {f.path}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedPath && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-2.5 py-1.5 text-[10px] text-[var(--text-muted)]">
              <span>
                Click a{" "}
                <span className="text-[var(--success)]">+ line</span> to leave a
                review note
                {fileComments.length > 0
                  ? ` · ${fileComments.length} note${fileComments.length === 1 ? "" : "s"}`
                  : ""}
              </span>
              {hunkCount > 1 && (
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={collapseAllHunks}
                    className="rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  >
                    Collapse hunks
                  </button>
                  <button
                    type="button"
                    onClick={expandAllHunks}
                    className="rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  >
                    Expand
                  </button>
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto mono text-[11px] leading-snug">
              {lines.length === 0 ? (
                <p className="p-3 text-[var(--text-muted)]">No patch loaded.</p>
              ) : (
                lines.map((ln, i) => {
                  if (
                    ln.kind !== "hunk" &&
                    ln.hunkIndex != null &&
                    collapsedHunks.has(ln.hunkIndex)
                  ) {
                    return null;
                  }
                  if (ln.kind === "hunk" && ln.hunkIndex != null) {
                    const collapsed = collapsedHunks.has(ln.hunkIndex);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleHunk(ln.hunkIndex!)}
                        className="flex w-full items-center gap-1 bg-[var(--thought)]/10 px-2 py-0.5 text-left text-[var(--thought)] hover:bg-[var(--thought)]/18"
                        title={collapsed ? "Expand hunk" : "Collapse hunk"}
                      >
                        <span className="mono w-3 text-[9px]" aria-hidden>
                          {collapsed ? "▸" : "▾"}
                        </span>
                        <span className="whitespace-pre-wrap break-all">
                          {ln.text || " "}
                        </span>
                        {collapsed && (
                          <span className="ml-auto shrink-0 text-[9px] opacity-70">
                            collapsed
                          </span>
                        )}
                      </button>
                    );
                  }
                  const clickable = ln.kind === "add" && ln.newLine != null;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!clickable}
                      onClick={() => {
                        if (!clickable || ln.newLine == null) return;
                        setAnchor({
                          line: ln.newLine,
                          snippet: ln.text.slice(1),
                        });
                        setDraft("");
                      }}
                      className={`block w-full px-2 py-0.5 text-left ${
                        ln.kind === "add"
                          ? "bg-[var(--success)]/8 text-[var(--success)]"
                          : ln.kind === "del"
                            ? "bg-[var(--danger)]/8 text-[var(--danger)]"
                            : ln.kind === "meta"
                              ? "text-[var(--text-faint)]"
                              : "text-[var(--text-muted)]"
                      } ${clickable ? "cursor-pointer hover:bg-[var(--success)]/18" : "cursor-default"}`}
                    >
                      <span className="whitespace-pre-wrap break-all">
                        {ln.text || " "}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {anchor && selectedPath && (
              <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)] p-2.5">
                <div className="mb-1 text-[10px] text-[var(--text-muted)]">
                  Note on {selectedPath}:{anchor.line}
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder="What should change?"
                  className="mb-1.5 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={!draft.trim()}
                    onClick={() => {
                      onAddComment({
                        path: selectedPath,
                        startLine: anchor.line,
                        endLine: anchor.line,
                        body: draft.trim(),
                        snippet: anchor.snippet,
                      });
                      setDraft("");
                      setAnchor(null);
                    }}
                    className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-fg)] disabled:opacity-40"
                  >
                    Add note
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnchor(null);
                      setDraft("");
                    }}
                    className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {comments.length > 0 && (
              <div className="max-h-28 overflow-y-auto border-t border-[var(--border)] p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                  Review notes → next send
                </div>
                <ul className="space-y-1">
                  {comments.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start gap-2 rounded-md bg-[var(--bg)] px-2 py-1 text-[11px]"
                    >
                      <span className="min-w-0 flex-1 text-[var(--text-muted)]">
                        <span className="mono text-[var(--warning)]">
                          {c.path}
                          {c.startLine != null ? `:${c.startLine}` : ""}
                        </span>
                        {" — "}
                        {c.body}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveComment(c.id)}
                        className="shrink-0 text-[var(--text-faint)] hover:text-[var(--danger)]"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col">{body}</div>;
  }

  return (
    <div
      className={`flex shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)] transition-all ${
        open ? "w-[22rem]" : "w-10"
      }`}
    >
      <button
        onClick={onToggle}
        className="flex items-center gap-2 border-b border-[var(--border)] px-2.5 py-2.5 text-left text-xs hover:bg-[var(--bg-hover)]"
        title="Toggle diff pane"
      >
        <span className="font-semibold tracking-wide text-[var(--tool)]">
          {open ? "Diff" : "D"}
        </span>
        {open && (
          <span className="mono ml-auto text-[10px] text-[var(--text-muted)]">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        )}
      </button>
      {open && body}
    </div>
  );
}
