import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GitFileStatus } from "../types";
import { GIT_REFRESH_DEBOUNCE_MS } from "../lib/caps";

/**
 * Working-tree status + unified diff for the Diff pane.
 * Auto-refresh is debounced after mutating tools (caller supplies session cwd lookup).
 */
export function useGitDiff(opts: {
  /** Current active session id (auto-refresh only for this session). */
  activeId: string | null;
  /** Resolve cwd for a session id (for scheduleGitRefresh). */
  getSessionCwd: (sessionId: string) => string | undefined;
}) {
  const { activeId, getSessionCwd } = opts;

  const [gitFiles, setGitFiles] = useState<GitFileStatus[]>([]);
  const [gitIsRepo, setGitIsRepo] = useState<boolean | null>(null);
  const [gitPatch, setGitPatch] = useState("");
  const [gitSelected, setGitSelected] = useState<string | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitLoading, setGitLoading] = useState(false);

  const gitSelectedRef = useRef(gitSelected);
  gitSelectedRef.current = gitSelected;
  const gitRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const refreshGit = useCallback(async (cwd: string, path?: string | null) => {
    if (!cwd) return;
    setGitLoading(true);
    setGitError(null);
    try {
      const st = await invoke<{
        isRepo: boolean;
        files: GitFileStatus[];
        error?: string | null;
      }>("git_status", { cwd });
      setGitIsRepo(st.isRepo);
      setGitFiles(st.files ?? []);
      if (st.error) setGitError(st.error);
      const select =
        path ?? gitSelectedRef.current ?? st.files?.[0]?.path ?? null;
      if (select && st.isRepo) {
        const stillThere = st.files?.some((f) => f.path === select);
        const pick = stillThere ? select : (st.files?.[0]?.path ?? select);
        setGitSelected(pick);
        const d = await invoke<{
          path: string | null;
          patch: string;
          isRepo: boolean;
          error?: string | null;
        }>("git_diff", { cwd, path: pick });
        setGitPatch(d.patch ?? "");
        if (d.error) setGitError(d.error);
      } else if (!st.isRepo) {
        setGitPatch("");
        setGitSelected(null);
      } else {
        setGitPatch("");
      }
    } catch (e) {
      setGitError(String(e));
    } finally {
      setGitLoading(false);
    }
  }, []);

  /** Debounced git refresh after mutating tools (mid-run Diff updates). */
  const scheduleGitRefresh = useCallback(
    (sessionId: string) => {
      const cwd = getSessionCwd(sessionId);
      if (!cwd) return;
      if (activeIdRef.current && sessionId !== activeIdRef.current) return;
      if (gitRefreshTimer.current) clearTimeout(gitRefreshTimer.current);
      gitRefreshTimer.current = setTimeout(() => {
        void refreshGit(cwd, gitSelectedRef.current);
      }, GIT_REFRESH_DEBOUNCE_MS);
    },
    [getSessionCwd, refreshGit],
  );

  const selectGitFile = useCallback(
    async (cwd: string, path: string) => {
      setGitSelected(path);
      setGitLoading(true);
      try {
        const d = await invoke<{
          path: string | null;
          patch: string;
          error?: string | null;
        }>("git_diff", { cwd, path });
        setGitPatch(d.patch ?? "");
        if (d.error) setGitError(d.error);
      } catch (e) {
        setGitError(String(e));
      } finally {
        setGitLoading(false);
      }
    },
    [],
  );

  return {
    gitFiles,
    gitIsRepo,
    gitPatch,
    gitSelected,
    gitError,
    gitLoading,
    gitSelectedRef,
    refreshGit,
    scheduleGitRefresh,
    selectGitFile,
  };
}
