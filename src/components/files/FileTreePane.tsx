import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { folderName } from "../../lib/format";

export type FsEntry = {
  name: string;
  path: string;
  isDir: boolean;
};

type ListDirResult = {
  path: string;
  entries: FsEntry[];
  error?: string | null;
};

type Props = {
  /** Project root (session cwd). */
  root: string;
  open: boolean;
  onClose: () => void;
  /** When true, fill a side column (no outer chrome toggle). */
  embedded?: boolean;
};

type NodeState = {
  loading: boolean;
  error: string | null;
  children: FsEntry[] | null;
};

const WIDTH_KEY = "grok-desk.fileTreeWidth";
const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 160;
const MAX_WIDTH = 420;

function loadWidth(): number {
  try {
    const n = parseInt(localStorage.getItem(WIDTH_KEY) || "", 10);
    if (Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH;
}

/**
 * Project file explorer — list under session cwd; open files with the OS default.
 * Skips heavy dirs (node_modules, target, .git, …) on the Rust side.
 */
export function FileTreePane({ root, open, onClose }: Props) {
  const [width, setWidth] = useState(loadWidth);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});
  const [rootError, setRootError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const loadDir = useCallback(async (dirPath: string) => {
    setNodes((prev) => ({
      ...prev,
      [dirPath]: {
        loading: true,
        error: null,
        children: prev[dirPath]?.children ?? null,
      },
    }));
    try {
      const res = await invoke<ListDirResult>("list_project_dir", {
        root,
        path: dirPath === root ? null : dirPath,
        showHidden: false,
      });
      if (res.error) {
        setNodes((prev) => ({
          ...prev,
          [dirPath]: { loading: false, error: res.error!, children: null },
        }));
        return;
      }
      setNodes((prev) => ({
        ...prev,
        [dirPath]: {
          loading: false,
          error: null,
          children: res.entries,
        },
      }));
    } catch (e) {
      setNodes((prev) => ({
        ...prev,
        [dirPath]: {
          loading: false,
          error: String(e),
          children: null,
        },
      }));
    }
  }, [root]);

  // Load root when opened / root changes
  useEffect(() => {
    if (!open || !root) return;
    setExpanded({ [root]: true });
    setNodes({});
    setRootError(null);
    void (async () => {
      try {
        const res = await invoke<ListDirResult>("list_project_dir", {
          root,
          path: null,
          showHidden: false,
        });
        if (res.error) {
          setRootError(res.error);
          return;
        }
        setNodes({
          [root]: {
            loading: false,
            error: null,
            children: res.entries,
          },
        });
      } catch (e) {
        setRootError(String(e));
      }
    })();
  }, [open, root]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = !prev[path];
      if (next && !nodes[path]?.children) {
        void loadDir(path);
      }
      return { ...prev, [path]: next };
    });
  };

  const openEntry = async (entry: FsEntry) => {
    setBusyPath(entry.path);
    try {
      await openPath(entry.path);
    } catch (e) {
      setRootError(`Open failed: ${e}`);
    } finally {
      setBusyPath(null);
    }
  };

  const revealEntry = async (entry: FsEntry) => {
    try {
      await revealItemInDir(entry.path);
    } catch (e) {
      setRootError(`Reveal failed: ${e}`);
    }
  };

  const onResizeStart = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let latest = startW;
    const onMove = (ev: globalThis.MouseEvent) => {
      latest = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startW + (ev.clientX - startX)),
      );
      setWidth(latest);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try {
        localStorage.setItem(WIDTH_KEY, String(latest));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (!open) return null;

  const renderEntries = (entries: FsEntry[], depth: number) => (
    <ul className="select-none" role="group">
      {entries.map((ent) => {
        const isOpen = !!expanded[ent.path];
        const node = nodes[ent.path];
        return (
          <li key={ent.path}>
            <div
              className={`group flex items-center gap-0.5 pr-1 text-[11px] ${
                busyPath === ent.path ? "opacity-60" : ""
              }`}
              style={{ paddingLeft: 6 + depth * 10 }}
            >
              {ent.isDir ? (
                <button
                  type="button"
                  onClick={() => toggleDir(ent.path)}
                  className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--bg-hover)]"
                  title={ent.path}
                >
                  <span
                    className="mono w-3 shrink-0 text-[9px] text-[var(--text-faint)]"
                    aria-hidden
                  >
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span className="truncate text-[var(--text)]">{ent.name}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onDoubleClick={() => void openEntry(ent)}
                  onClick={() => void openEntry(ent)}
                  className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--bg-hover)]"
                  title={`${ent.path}\nClick to open in external editor`}
                >
                  <span className="w-3 shrink-0" aria-hidden />
                  <span className="truncate text-[var(--text-muted)] group-hover:text-[var(--text)]">
                    {ent.name}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void revealEntry(ent)}
                title="Reveal in file manager"
                className="shrink-0 rounded px-1 text-[10px] text-[var(--text-faint)] opacity-0 hover:text-[var(--accent)] group-hover:opacity-100"
                aria-label={`Reveal ${ent.name}`}
              >
                ↗
              </button>
            </div>
            {ent.isDir && isOpen && (
              <div>
                {node?.loading && (
                  <div
                    className="py-0.5 text-[10px] text-[var(--text-faint)]"
                    style={{ paddingLeft: 16 + depth * 10 }}
                  >
                    Loading…
                  </div>
                )}
                {node?.error && (
                  <div
                    className="py-0.5 text-[10px] text-[var(--danger)]"
                    style={{ paddingLeft: 16 + depth * 10 }}
                  >
                    {node.error}
                  </div>
                )}
                {node?.children && renderEntries(node.children, depth + 1)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  const rootNode = nodes[root];

  return (
    <div
      data-file-tree
      className="relative flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]"
      style={{ width }}
      role="navigation"
      aria-label="Project files"
    >
      <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-1.5">
        <span
          className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]"
          title={root}
        >
          {folderName(root) || "Files"}
        </span>
        <button
          type="button"
          onClick={() => void loadDir(root)}
          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          title="Refresh"
        >
          ↻
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          title="Hide file tree (Alt+F)"
          aria-label="Hide file tree"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {rootError && (
          <p className="px-2 py-1 text-[11px] text-[var(--danger)]">{rootError}</p>
        )}
        {!rootError && rootNode?.loading && (
          <p className="px-2 py-1 text-[11px] text-[var(--text-faint)]">Loading…</p>
        )}
        {!rootError && rootNode?.children && rootNode.children.length === 0 && (
          <p className="px-2 py-2 text-[11px] text-[var(--text-muted)]">Empty folder</p>
        )}
        {!rootError && rootNode?.children && renderEntries(rootNode.children, 0)}
      </div>

      <div className="border-t border-[var(--border)] px-2 py-1 text-[9px] text-[var(--text-faint)]">
        Click file → open externally
      </div>

      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize file tree"
        onMouseDown={onResizeStart}
        className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-[var(--accent)]/30"
      />
    </div>
  );
}

export function loadFileTreeOpen(): boolean {
  try {
    return localStorage.getItem("grok-desk.fileTreeOpen") === "1";
  } catch {
    return false;
  }
}

export function saveFileTreeOpen(open: boolean) {
  try {
    localStorage.setItem("grok-desk.fileTreeOpen", open ? "1" : "0");
  } catch {
    /* ignore */
  }
}
