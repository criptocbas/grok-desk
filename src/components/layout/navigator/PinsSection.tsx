import type { DeskSession, SessionPin } from "../../../types";
import { folderName, shortId } from "../../../lib/format";
import { resolveSessionTitle } from "../../../lib/sessionTitle";
import { SessionTitleLabel } from "../../session/SessionTitleLabel";

export type PinSection = {
  groupId: string | null;
  label: string | null;
  items: SessionPin[];
};

type Props = {
  pins: SessionPin[];
  pinSections: PinSection[];
  sessions: DeskSession[];
  activeId: string | null;
  resumingPins: boolean;
  dragPinId: string | null;
  onDragPinId: (id: string | null) => void;
  onPinDrop: (targetId: string) => void;
  onReorderPins?: (sessionIds: string[]) => void;
  onSelectSession: (sessionId: string, cwd: string) => void;
  onResumePin: (pin: SessionPin) => void;
  onUnpin: (sessionId: string, cwd?: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
};

export function PinsSection({
  pins,
  pinSections,
  sessions,
  activeId,
  resumingPins,
  dragPinId,
  onDragPinId,
  onPinDrop,
  onReorderPins,
  onSelectSession,
  onResumePin,
  onUnpin,
  onRenameSession,
}: Props) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          Pinned
        </span>
        <span className="mono text-[10px] text-[var(--text-faint)]">
          {resumingPins ? "…" : pins.length}
        </span>
      </div>
      {pins.length === 0 ? (
        <p className="px-2 text-[11px] leading-relaxed text-[var(--text-faint)]">
          Pin a session to reopen it automatically after restart. Use 📌 on a
          tab or in Recents. Assign a group under Open to organize pins.
        </p>
      ) : (
        <div className="space-y-2">
          {pinSections.map((section) => (
            <div key={section.groupId ?? "__ungrouped"}>
              {section.label && (
                <div className="mb-0.5 flex items-center gap-1 px-1.5 pt-0.5">
                  <span
                    className="truncate text-[10px] font-semibold tracking-wide text-[var(--accent)]"
                    title={
                      section.groupId
                        ? `Group: ${section.label}`
                        : section.label
                    }
                  >
                    {section.label}
                  </span>
                  <span className="mono text-[9px] text-[var(--text-faint)]">
                    {section.items.length}
                  </span>
                </div>
              )}
              <ul className="space-y-0.5">
                {section.items.map((p) => {
                  const openSess = sessions.find(
                    (s) => s.sessionId === p.sessionId,
                  );
                  const open = !!openSess;
                  const selected = p.sessionId === activeId;
                  // Prefer open tab title so pin row matches tab strip.
                  const displayTitle = resolveSessionTitle(
                    p.cwd,
                    openSess?.title,
                    p.title,
                  );
                  return (
                    <li
                      key={`${p.sessionId}:${p.cwd}`}
                      draggable={!!onReorderPins}
                      onDragStart={() => onDragPinId(p.sessionId)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onPinDrop(p.sessionId)}
                      onDragEnd={() => onDragPinId(null)}
                      className={
                        dragPinId === p.sessionId ? "opacity-50" : undefined
                      }
                    >
                      <div
                        className={`group flex w-full items-start gap-1 rounded-lg px-1.5 py-1.5 ${
                          selected
                            ? "bg-[var(--bg-active)] ring-1 ring-[var(--accent)]/35"
                            : "hover:bg-[var(--bg-hover)]"
                        } ${p.missing ? "opacity-60" : ""} ${
                          onReorderPins
                            ? "cursor-grab active:cursor-grabbing"
                            : ""
                        } ${section.groupId ? "ml-0.5 border-l-2 border-[var(--accent)]/25 pl-1" : ""}`}
                      >
                        <button
                          type="button"
                          disabled={p.missing && !open}
                          title={
                            p.missing
                              ? "Session missing on disk — unpin or resume failed"
                              : open
                                ? "Focus session"
                                : "Open pinned session"
                          }
                          onClick={() => {
                            if (open) {
                              onSelectSession(p.sessionId, p.cwd);
                              return;
                            }
                            if (p.missing) return;
                            onResumePin(p);
                          }}
                          className="flex min-w-0 flex-1 items-start gap-2 px-1 py-0.5 text-left disabled:cursor-not-allowed"
                        >
                          <span className="mt-1 shrink-0 text-[10px] text-[var(--accent)]">
                            📌
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 truncate text-[11px] font-medium">
                              <SessionTitleLabel
                                title={displayTitle}
                                className="text-[11px] font-medium"
                                onRename={(next) =>
                                  onRenameSession(p.sessionId, next)
                                }
                              />
                              {p.missing ? (
                                <span className="shrink-0 text-[10px] font-normal text-[var(--danger)]">
                                  missing
                                </span>
                              ) : open ? (
                                <span className="shrink-0 text-[10px] font-normal text-[var(--success)]">
                                  open
                                </span>
                              ) : null}
                            </div>
                            <div className="mono truncate text-[10px] text-[var(--text-faint)]">
                              {folderName(p.cwd)} · {shortId(p.sessionId)}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          title="Unpin"
                          onClick={() => void onUnpin(p.sessionId, p.cwd)}
                          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-[var(--text-faint)] opacity-0 hover:bg-[var(--bg-hover)] hover:text-[var(--warning)] group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {resumingPins && (
        <p className="mt-1 px-2 text-[10px] text-[var(--warning)]">
          Restoring pinned sessions…
        </p>
      )}
    </div>
  );
}
