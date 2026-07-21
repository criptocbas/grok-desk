import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppVersionInfo,
  UpdateCheckResult,
  UpdateStartResult,
} from "../../types";

type Density = "comfortable" | "compact";
type Theme = "dark" | "light" | "system";
type Accent = "forge" | "indigo" | "teal";

const PREFS_KEY = "grok-desk.prefs.v1";

type Prefs = {
  density: Density;
  theme: Theme;
  accent: Accent;
  fontScale: "s" | "m" | "l";
};

const DEFAULTS: Prefs = {
  density: "comfortable",
  theme: "dark",
  accent: "forge",
  fontScale: "m",
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

function applyPrefs(p: Prefs) {
  const root = document.documentElement;
  root.dataset.density = p.density;

  if (p.theme === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "dark" : "light";
  } else {
    root.dataset.theme = p.theme;
  }

  if (p.accent === "forge") {
    delete root.dataset.accent;
  } else {
    root.dataset.accent = p.accent;
  }

  const scale =
    p.fontScale === "s" ? "0.92" : p.fontScale === "l" ? "1.08" : "1";
  root.style.setProperty("--font-scale", scale);
  root.style.fontSize = `calc(var(--font-ui) * ${scale})`;
}

/** Apply saved prefs on boot (call from main or App mount). */
export function applyStoredUiPrefs() {
  applyPrefs(loadPrefs());
}

type Props = {
  /** Optional: parent may pass live update state so banner + settings stay in sync. */
  versionInfo?: AppVersionInfo | null;
  updateCheck?: UpdateCheckResult | null;
  updating?: boolean;
  onCheckUpdates?: () => void;
  onStartUpdate?: () => void;
};

export function SettingsPane({
  versionInfo: versionProp,
  updateCheck: updateProp,
  updating: updatingProp,
  onCheckUpdates,
  onStartUpdate,
}: Props = {}) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [localVersion, setLocalVersion] = useState<AppVersionInfo | null>(null);
  const [localUpdate, setLocalUpdate] = useState<UpdateCheckResult | null>(null);
  const [localUpdating, setLocalUpdating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateLog, setUpdateLog] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const versionInfo = versionProp ?? localVersion;
  const updateCheck = updateProp ?? localUpdate;
  const updating = updatingProp ?? localUpdating;

  useEffect(() => {
    applyPrefs(prefs);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  useEffect(() => {
    if (versionProp) return;
    void invoke<AppVersionInfo>("app_version_info")
      .then(setLocalVersion)
      .catch(() => setLocalVersion(null));
  }, [versionProp]);

  const refreshLog = useCallback(async () => {
    try {
      const log = await invoke<string>("read_update_log", { maxBytes: 8000 });
      setUpdateLog(log);
    } catch {
      setUpdateLog("");
    }
  }, []);

  useEffect(() => {
    if (!updating) return;
    void refreshLog();
    const t = window.setInterval(() => void refreshLog(), 3000);
    return () => window.clearInterval(t);
  }, [updating, refreshLog]);

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const handleCheck = async () => {
    if (onCheckUpdates) {
      onCheckUpdates();
      return;
    }
    setChecking(true);
    setActionMsg(null);
    try {
      const r = await invoke<UpdateCheckResult>("check_for_updates");
      setLocalUpdate(r);
      if (r.error) setActionMsg(r.error);
      else if (!r.updateAvailable)
        setActionMsg("You're on the latest main commit.");
    } catch (e) {
      setActionMsg(String(e));
    } finally {
      setChecking(false);
    }
  };

  const handleUpdate = async () => {
    if (onStartUpdate) {
      onStartUpdate();
      return;
    }
    setActionMsg(null);
    try {
      const r = await invoke<UpdateStartResult>("start_self_update");
      setLocalUpdating(true);
      setActionMsg(r.message);
      void refreshLog();
    } catch (e) {
      setActionMsg(String(e));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <div className="mb-3">
        <h2 className="text-[12px] font-semibold tracking-wide text-[var(--text)]">
          Appearance
        </h2>
        <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">
          Local to this machine. Does not change agent behavior.
        </p>
      </div>

      <Field label="Theme">
        <select
          className="ctrl-select max-w-none w-full"
          value={prefs.theme}
          onChange={(e) => set("theme", e.target.value as Theme)}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </Field>

      <Field label="Density">
        <select
          className="ctrl-select max-w-none w-full"
          value={prefs.density}
          onChange={(e) => set("density", e.target.value as Density)}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </Field>

      <Field label="Font size">
        <select
          className="ctrl-select max-w-none w-full"
          value={prefs.fontScale}
          onChange={(e) => set("fontScale", e.target.value as Prefs["fontScale"])}
        >
          <option value="s">Small</option>
          <option value="m">Medium</option>
          <option value="l">Large</option>
        </select>
      </Field>

      <Field label="Accent">
        <select
          className="ctrl-select max-w-none w-full"
          value={prefs.accent}
          onChange={(e) => set("accent", e.target.value as Accent)}
        >
          <option value="forge">Forge copper</option>
          <option value="indigo">Mission indigo</option>
          <option value="teal">Electric teal</option>
        </select>
      </Field>

      {/* ── App install & updates ─────────────────────────────────────── */}
      <div className="mb-2 mt-5">
        <h2 className="text-[12px] font-semibold tracking-wide text-[var(--text)]">
          App & updates
        </h2>
        <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">
          User-local install for Omarchy / Super+Space. Updates pull main and
          rebuild.
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-[11px]">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-[var(--text)]">
            v{versionInfo?.version ?? "…"}
          </span>
          {versionInfo?.commitShort && (
            <span className="mono text-[var(--text-faint)]">
              {versionInfo.commitShort}
            </span>
          )}
          {versionInfo?.isInstalled ? (
            <span className="rounded-full bg-[var(--success)]/12 px-1.5 py-0.5 text-[10px] text-[var(--success)]">
              installed
            </span>
          ) : (
            <span className="rounded-full bg-[var(--bg-panel)] px-1.5 py-0.5 text-[10px] text-[var(--text-faint)]">
              dev / not installed
            </span>
          )}
        </div>
        {versionInfo?.installMeta?.installedAt && (
          <div className="mt-1 text-[var(--text-faint)]">
            Installed {versionInfo.installMeta.installedAt}
          </div>
        )}
        {versionInfo?.repoPath && (
          <div
            className="mt-1 truncate mono text-[var(--text-faint)]"
            title={versionInfo.repoPath}
          >
            {versionInfo.repoPath}
          </div>
        )}

        {updateCheck?.updateAvailable && (
          <div className="mt-2 rounded border border-[var(--accent)]/30 bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-2 py-1.5 text-[var(--accent)]">
            New:{" "}
            <span className="mono">
              {updateCheck.remoteCommitShort ??
                updateCheck.remoteCommit?.slice(0, 7)}
            </span>
            {updateCheck.remoteMessage
              ? ` — ${updateCheck.remoteMessage.slice(0, 60)}`
              : ""}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={checking || updating}
            onClick={() => void handleCheck()}
            className="rounded border border-[var(--border)] px-2 py-1 text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check for updates"}
          </button>
          {(updateCheck?.updateAvailable || updating) &&
            (updateCheck?.canAutoUpdate ?? versionInfo?.repoPath) && (
              <button
                type="button"
                disabled={updating}
                onClick={() => void handleUpdate()}
                className="rounded border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-2 py-1 font-medium text-[var(--accent)] hover:bg-[var(--accent)]/25 disabled:opacity-60"
              >
                {updating ? "Updating…" : "Update now"}
              </button>
            )}
          <button
            type="button"
            onClick={() => void refreshLog()}
            className="rounded border border-[var(--border)] px-2 py-1 text-[var(--text-faint)] hover:text-[var(--text-muted)]"
          >
            Refresh log
          </button>
        </div>

        {actionMsg && (
          <p className="mt-2 text-[var(--text-muted)]">{actionMsg}</p>
        )}
        {updateCheck?.error && !actionMsg && (
          <p className="mt-2 text-[var(--danger)]">{updateCheck.error}</p>
        )}

        {!versionInfo?.isInstalled && (
          <p className="mt-2 leading-relaxed text-[var(--text-faint)]">
            Install for Super+Space:{" "}
            <code className="mono text-[var(--text-muted)]">
              ./scripts/install-local.sh
            </code>
          </p>
        )}
        {updateCheck &&
          !updateCheck.canAutoUpdate &&
          updateCheck.updateAvailable && (
            <p className="mt-2 leading-relaxed text-[var(--text-faint)]">
              Auto-update needs the git checkout with{" "}
              <code className="mono">scripts/install-local.sh</code>. Run{" "}
              <code className="mono">./scripts/install-local.sh --update</code>{" "}
              from the repo.
            </p>
          )}

        {updateLog ? (
          <pre className="mt-2 max-h-40 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-panel)] p-2 mono text-[10px] leading-snug text-[var(--text-faint)] whitespace-pre-wrap">
            {updateLog}
          </pre>
        ) : null}
      </div>

      <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
          Protected
        </div>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
          <li>Plan approval is a real ACP handshake — not cosmetic.</li>
          <li>Stop unlocks the UI immediately; stall banner recovers quiet turns.</li>
          <li>Thought / transcript caps protect the webview from OOM.</li>
        </ul>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
        {label}
      </span>
      {children}
    </label>
  );
}
