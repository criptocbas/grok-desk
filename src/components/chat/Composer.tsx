import {
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { AvailableCommand, QueuedPrompt } from "../../types";
import type { PendingImage } from "../../lib/agentHelpers";
import {
  SlashPalette,
  filterCommands,
  getSlashMatch,
} from "../SlashPalette";
import { PromptQueue } from "./PromptQueue";

type Props = {
  busy: boolean;
  prompt: string;
  onPromptChange: (value: string, cursor: number) => void;
  onCursor: (cursor: number) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  pendingImages: PendingImage[];
  onRemoveImage: (id: string) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  promptQueue: QueuedPrompt[];
  onClearQueue: () => void;
  onRemoveQueued: (id: string) => void;
  availableCommands: AvailableCommand[];
  slashOpen: boolean;
  slashCommands: AvailableCommand[];
  slashMatch: ReturnType<typeof getSlashMatch>;
  slashIndex: number;
  onSlashIndex: (i: number | ((prev: number) => number)) => void;
  onPickSlash: (cmd: AvailableCommand) => void;
  onDismissSlash: () => void;
  slashDismissed: boolean;
  onUndismissSlash: () => void;
  onSend: () => void;
  onCancel: () => void;
};

export function Composer({
  busy,
  prompt,
  onPromptChange,
  onCursor,
  composerRef,
  pendingImages,
  onRemoveImage,
  onPaste,
  promptQueue,
  onClearQueue,
  onRemoveQueued,
  availableCommands,
  slashOpen,
  slashCommands,
  slashMatch,
  slashIndex,
  onSlashIndex,
  onPickSlash,
  onDismissSlash,
  slashDismissed,
  onUndismissSlash,
  onSend,
  onCancel,
}: Props) {
  const syncCursor = (el: HTMLTextAreaElement) => {
    onCursor(el.selectionStart ?? 0);
  };

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="mx-auto max-w-3xl">
        <PromptQueue
          queue={promptQueue}
          busy={busy}
          onClearAll={onClearQueue}
          onRemove={onRemoveQueued}
        />

        {pendingImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingImages.map((img) => (
              <div
                key={img.id}
                className="relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--border)]"
              >
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemoveImage(img.id)}
                  className="absolute right-0.5 top-0.5 rounded bg-[var(--bg)]/85 px-1 text-[10px] text-[var(--text)] ring-1 ring-[var(--border-strong)]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <SlashPalette
          open={slashOpen}
          commands={slashCommands}
          match={slashMatch}
          selectedIndex={slashIndex}
          onSelectedIndex={onSlashIndex}
          onPick={onPickSlash}
          onClose={onDismissSlash}
        />

        <div className="flex gap-2">
          <textarea
            ref={composerRef}
            value={prompt}
            onChange={(e) => {
              onPromptChange(e.target.value, e.target.selectionStart ?? 0);
            }}
            onClick={(e) => syncCursor(e.currentTarget)}
            onKeyUp={(e) => syncCursor(e.currentTarget)}
            onSelect={(e) => syncCursor(e.currentTarget)}
            onPaste={onPaste}
            onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
              const match = getSlashMatch(
                prompt,
                e.currentTarget.selectionStart ?? 0,
              );
              const filtered = match
                ? filterCommands(availableCommands, match.query)
                : [];
              const paletteActive = Boolean(match) && !slashDismissed;

              if (paletteActive && e.key === "Escape") {
                e.preventDefault();
                onDismissSlash();
                return;
              }

              if (
                paletteActive &&
                filtered.length > 0 &&
                (e.key === "ArrowDown" || e.key === "ArrowUp")
              ) {
                e.preventDefault();
                onSlashIndex((i) => {
                  if (e.key === "ArrowDown") return (i + 1) % filtered.length;
                  return (i - 1 + filtered.length) % filtered.length;
                });
                return;
              }

              if (paletteActive && filtered.length > 0 && e.key === "Tab") {
                e.preventDefault();
                const pick = filtered[slashIndex] ?? filtered[0];
                if (pick) onPickSlash(pick);
                return;
              }

              if (e.key === "Enter" && !e.shiftKey) {
                if (
                  paletteActive &&
                  filtered.length > 0 &&
                  match &&
                  (filtered.length === 1 ||
                    match.query.length > 0 ||
                    slashIndex > 0)
                ) {
                  e.preventDefault();
                  const pick = filtered[slashIndex] ?? filtered[0];
                  if (pick) onPickSlash(pick);
                  return;
                }
                e.preventDefault();
                void onSend();
                return;
              }

              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void onSend();
              }
            }}
            rows={2}
            placeholder={
              busy
                ? "Type next prompt or /command… Enter queues when busy"
                : "Message Grok…  / for commands · Enter send · paste images"
            }
            className="min-h-[56px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-[var(--accent)]"
          />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                onUndismissSlash();
                const el = composerRef.current;
                if (!el) return;
                if (!getSlashMatch(prompt, el.selectionStart ?? 0)) {
                  const pos = el.selectionStart ?? prompt.length;
                  const next =
                    prompt.slice(0, pos) +
                    (pos > 0 && !/\s$/.test(prompt.slice(0, pos))
                      ? " /"
                      : "/") +
                    prompt.slice(pos);
                  onPromptChange(next, pos + (next.length - prompt.length));
                  requestAnimationFrame(() => {
                    const p = pos + (next.length - prompt.length);
                    el.focus();
                    el.setSelectionRange(p, p);
                    onCursor(p);
                  });
                } else {
                  el.focus();
                }
              }}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              title="Slash commands & skills"
            >
              /
            </button>
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={!prompt.trim() && pendingImages.length === 0}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-40"
              title={
                busy
                  ? "Add to queue — runs after the current turn"
                  : "Send now"
              }
            >
              {busy ? "Queue" : "Send"}
            </button>
            {busy && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-[var(--border)] px-4 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
              >
                Stop
              </button>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-faint)]">
          <span>
            <span className="kbd">/</span> commands
            {slashCommands.length > 0 ? ` · ${slashCommands.length}` : ""}
          </span>
          <span>
            <span className="kbd">Alt</span>+<span className="kbd">P</span> plan
          </span>
          <span>
            <span className="kbd">Alt</span>+<span className="kbd">D</span> diff
          </span>
          <span>
            <span className="kbd">Ctrl</span>+
            <span className="kbd">/</span> shortcuts
          </span>
          {busy && (
            <span className="text-[var(--warning)]">
              Composer stays open — queue the next job anytime
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
