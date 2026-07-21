import { useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  className?: string;
  /** Extra classes for the input while editing */
  inputClassName?: string;
  onRename: (next: string) => void;
};

/**
 * Display title with double-click (or F2-style) inline rename.
 * Enter saves, Escape cancels, blur saves.
 */
export function SessionTitleLabel({
  title,
  className = "",
  inputClassName = "",
  onRename,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next === title.trim()) return;
    onRename(next);
  };

  const cancel = () => {
    setDraft(title);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
        maxLength={80}
        aria-label="Session name"
        className={
          inputClassName ||
          `w-full min-w-0 rounded border border-[var(--accent)] bg-[var(--bg)] px-1 py-0.5 font-medium text-[var(--text)] outline-none ${className}`
        }
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title="Double-click to rename"
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setDraft(title);
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "F2" || (e.key === "Enter" && e.altKey)) {
          e.preventDefault();
          e.stopPropagation();
          setDraft(title);
          setEditing(true);
        }
      }}
      className={`cursor-text truncate ${className}`}
    >
      {title || "Untitled"}
    </span>
  );
}
