import { useMemo, useState } from "react";
import type { GitFileStatus, ReviewComment } from "../types";

type Props = {
  open: boolean;
  onToggle: () => void;
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
  return "text-[var(--accent)]";
}

/** Parse unified diff into line objects for click-to-comment. */
function parseDiffLines(patch: string): {
  text: string;
  kind: "meta" | "add" | "del" | "ctx" | "hunk";
  newLine: number | null;
}[] {
  const out: {
    text: string;
    kind: "meta" | "add" | "del" | "ctx" | "hunk";
    newLine: number | null;
  }[] = [];
  let newLine = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      const m = line.match(/\+(\d+)/);
      newLine = m ? parseInt(m[1], 10) : newLine;
      out.push({ text: line, kind: "hunk", newLine: null });
      continue;
    }
    if (
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      out.push({ text: line, kind: "meta", newLine: null });
      continue;
    }
    if (line.startsWith("+")) {
      out.push({ text: line, kind: "add", newLine });
      newLine += 1;
      continue;
    }
    if (line.startsWith("-")) {
      out.push({ text: line, kind: "del", newLine: null });
      continue;
    }
    if (line.startsWith("\\")) {
      out.push({ text: line, kind: "meta", newLine: null });
      continue;
    }
    // context
    out.push({ text: line, kind: "ctx", newLine });
    newLine += 1;
  }
  return out;
}

export function DiffPane({
  open,
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

  const lines = useMemo(() => parseDiffLines(patch), [patch]);

  const fileComments = selectedPath
    ? comments.filter((c) => c.path === selectedPath)
    : [];

  return (
    <div
      className={`flex shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)] transition-all ${
        open ? "w-[22rem]" : "w-10"
      }`}
    >
      <button
        onClick={onToggle}
        className="flex items-center gap-2 border-b border-[var(--border)] px-2.5 py-2.5 text-left text-xs hover:bg-white/5"
        title="Toggle diff pane"
      >
        <span className="font-semibold tracking-wide text-[var(--tool)]">
          {open ? "Diff" : "D"}
        </span>
        {open && (
          <span className="mono ml-auto text-[10px] text-[var(--text-muted)]">
            {files.length} file{files.length === 1 ? "" : "s"}
            {comments.length > 0 ? ` · ${comments.length} note` : ""}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="flex items-center gap-1.5 border-b border-[var(--border)] p-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="rounded border border-[var(--border)] px-2 py-1 text-[11px] hover:border-[var(--tool)] disabled:opacity-40"
              title="Refresh git status and selected file patch"
            >
              {loading ? "…" : "↻ Refresh"}
            </button>
            <span className="text-[10px] text-[var(--text-muted)]">
              auto after writes
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {isRepo === false && (
              <p className="p-3 text-[11px] text-[var(--text-muted)]">
                Not a git repository — open a session in a git project to see
                diffs.
              </p>
            )}
            {error && (
              <p className="px-3 py-2 text-[11px] text-[var(--danger)]">{error}</p>
            )}
            {isRepo && files.length === 0 && !error && (
              <p className="p-3 text-[11px] text-[var(--text-muted)]">
                Working tree clean.
              </p>
            )}

            {files.length > 0 && (
              <ul className="max-h-36 shrink-0 overflow-y-auto border-b border-[var(--border)] p-1">
                {files.map((f) => (
                  <li key={f.path}>
                    <button
                      onClick={() => {
                        setAnchor(null);
                        setDraft("");
                        onSelectFile(f.path);
                      }}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] ${
                        selectedPath === f.path
                          ? "bg-[var(--tool)]/15"
                          : "hover:bg-white/5"
                      }`}
                    >
                      <span className={`mono w-6 shrink-0 ${statusColor(f.status)}`}>
                        {f.status}
                      </span>
                      <span className="mono truncate">{f.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="min-h-0 flex-1 overflow-auto p-1">
              {!selectedPath && files.length > 0 && (
                <p className="p-2 text-[11px] text-[var(--text-muted)]">
                  Select a file to view the patch. Click a{" "}
                  <span className="text-[var(--success)]">+</span> line to
                  attach a review comment.
                </p>
              )}
              {lines.map((ln, i) => {
                const clickable = ln.kind === "add" && ln.newLine != null;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!clickable}
                    onClick={() => {
                      if (ln.newLine == null || !selectedPath) return;
                      setAnchor({
                        line: ln.newLine,
                        snippet: ln.text.slice(1),
                      });
                    }}
                    className={`mono block w-full px-1 text-left text-[10px] leading-snug ${
                      ln.kind === "add"
                        ? "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        : ln.kind === "del"
                          ? "bg-red-500/10 text-red-300"
                          : ln.kind === "hunk"
                            ? "text-[var(--thought)]"
                            : "text-[var(--text-muted)]"
                    } ${clickable ? "cursor-pointer" : "cursor-default"}`}
                  >
                    {ln.text || " "}
                  </button>
                );
              })}
            </div>

            {anchor && selectedPath && (
              <div className="shrink-0 border-t border-[var(--border)] p-2">
                <div className="mb-1 text-[10px] text-[var(--text-muted)]">
                  Comment on {selectedPath}:{anchor.line}
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder="What should change here?"
                  className="mb-1 w-full resize-none rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] outline-none focus:border-[var(--accent)]"
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      if (!draft.trim()) return;
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
                    className="rounded bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-black"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setAnchor(null);
                      setDraft("");
                    }}
                    className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {fileComments.length > 0 && (
              <div className="max-h-28 shrink-0 overflow-auto border-t border-[var(--border)] p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Comments on file
                </div>
                <ul className="space-y-1">
                  {fileComments.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start gap-1 rounded bg-[var(--bg)] px-1.5 py-1 text-[10px]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="mono text-[var(--accent)]">
                          L{c.startLine}
                        </span>{" "}
                        {c.body}
                      </span>
                      <button
                        onClick={() => onRemoveComment(c.id)}
                        className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
