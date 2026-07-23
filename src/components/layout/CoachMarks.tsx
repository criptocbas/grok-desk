import { useEffect, useState } from "react";

const STORAGE_KEY = "grok-desk.coach.v1";

type Props = {
  /** Only show after user is connected with a project context. */
  ready: boolean;
};

const STEPS: { title: string; body: string; kbd?: string }[] = [
  {
    title: "Command palette",
    body: "Jump to sessions, panels, pins, and actions without leaving the keyboard.",
    kbd: "Ctrl+K",
  },
  {
    title: "Plan & Diff",
    body: "Plan steers the agent before code lands. Diff holds review notes for the next send.",
    kbd: "Alt+P · Alt+D",
  },
  {
    title: "Project terminal",
    body: "Human shell in the session folder — separate from agent tools.",
    kbd: "Ctrl+`",
  },
  {
    title: "File tree",
    body: "Browse the project and open files in your external editor.",
    kbd: "Alt+F",
  },
];

/**
 * Skippable first-run hints — never a modal trap (DESIGN.md).
 * Dismissed permanently via localStorage.
 */
export function CoachMarks({ ready }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!ready) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "done") return;
      setVisible(true);
    } catch {
      /* ignore */
    }
  }, [ready]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step >= STEPS.length - 1;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-[55] w-[min(20rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg-panel)] p-3 shadow-[var(--shadow-panel)]"
      role="dialog"
      aria-label="Getting started"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          Tip {step + 1}/{STEPS.length}
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="ml-auto text-[11px] text-[var(--text-faint)] hover:text-[var(--text-muted)]"
        >
          Skip all
        </button>
      </div>
      <p className="text-[13px] font-medium text-[var(--text)]">{current.title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
        {current.body}
      </p>
      {current.kbd && (
        <p className="mono mt-2 text-[11px] text-[var(--accent)]">{current.kbd}</p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--border-strong)] disabled:opacity-30"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            if (isLast) dismiss();
            else setStep((s) => s + 1);
          }}
          className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-fg)]"
        >
          {isLast ? "Got it" : "Next"}
        </button>
      </div>
    </div>
  );
}
