import { useEffect, useState } from "react";

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
  // Comfortable base already in CSS; scale multiplies via font-size on root
  root.style.fontSize = `calc(var(--font-ui) * ${scale})`;
}

/** Apply saved prefs on boot (call from main or App mount). */
export function applyStoredUiPrefs() {
  applyPrefs(loadPrefs());
}

export function SettingsPane() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  useEffect(() => {
    applyPrefs(prefs);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
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

      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
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
