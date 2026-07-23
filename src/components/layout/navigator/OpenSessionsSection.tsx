import type { DeskSession, SessionGroup } from "../../../types";
import { SessionRow } from "./SessionRow";

type Props = {
  sessions: DeskSession[];
  groups: SessionGroup[];
  sessionsByGroup: Map<string | null, DeskSession[]>;
  activeId: string | null;
  isPinned: (sessionId: string, cwd?: string) => boolean;
  newGroupOpen: boolean;
  newGroupName: string;
  onNewGroupOpen: (open: boolean) => void;
  onNewGroupName: (name: string) => void;
  onCreateGroup: (name: string) => void;
  renamingGroupId: string | null;
  renameGroupDraft: string;
  onRenamingGroupId: (id: string | null) => void;
  onRenameGroupDraft: (name: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSetGroupCollapsed: (groupId: string, collapsed: boolean) => void;
  onSetGroupPinned: (groupId: string, pinned: boolean) => void;
  onSelectSession: (sessionId: string, cwd: string) => void;
  onCloseSession: (sessionId: string) => void;
  onPin: (sessionId: string, cwd: string, title?: string | null) => void;
  onUnpin: (sessionId: string, cwd?: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSetSessionGroup: (sessionId: string, groupId: string | null) => void;
};

export function OpenSessionsSection({
  sessions,
  groups,
  sessionsByGroup,
  activeId,
  isPinned,
  newGroupOpen,
  newGroupName,
  onNewGroupOpen,
  onNewGroupName,
  onCreateGroup,
  renamingGroupId,
  renameGroupDraft,
  onRenamingGroupId,
  onRenameGroupDraft,
  onRenameGroup,
  onDeleteGroup,
  onSetGroupCollapsed,
  onSetGroupPinned,
  onSelectSession,
  onCloseSession,
  onPin,
  onUnpin,
  onRenameSession,
  onSetSessionGroup,
}: Props) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between border-t border-[var(--border)] px-1 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          Open
        </span>
        <div className="flex items-center gap-1">
          <span className="mono text-[10px] text-[var(--text-faint)]">
            {sessions.length}
          </span>
          <button
            type="button"
            title="New group"
            aria-label="Create session group"
            onClick={() => {
              onNewGroupOpen(!newGroupOpen);
              onNewGroupName("");
            }}
            className="rounded px-1.5 text-[12px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
          >
            +
          </button>
        </div>
      </div>

      {newGroupOpen && (
        <div className="mb-2 flex gap-1 px-1">
          <input
            value={newGroupName}
            onChange={(e) => onNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newGroupName.trim()) {
                onCreateGroup(newGroupName.trim());
                onNewGroupName("");
                onNewGroupOpen(false);
              } else if (e.key === "Escape") {
                onNewGroupOpen(false);
              }
            }}
            placeholder="Group name…"
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] outline-none focus:border-[var(--accent)]"
            autoFocus
          />
          <button
            type="button"
            disabled={!newGroupName.trim()}
            onClick={() => {
              if (!newGroupName.trim()) return;
              onCreateGroup(newGroupName.trim());
              onNewGroupName("");
              onNewGroupOpen(false);
            }}
            className="rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-[var(--accent-fg)] disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {sessions.length === 0 && groups.length === 0 ? (
        <p className="px-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
          Connect, open a session, or click a pin. Use + to create groups.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const members = sessionsByGroup.get(g.id) ?? [];
            const isCollapsed = !!g.collapsed;
            return (
              <div key={g.id}>
                <div className="group/hdr flex items-center gap-0.5 px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => onSetGroupCollapsed(g.id, !isCollapsed)}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--bg-hover)]"
                  >
                    <span className="text-[10px] text-[var(--text-faint)]">
                      {isCollapsed ? "▸" : "▾"}
                    </span>
                    {g.pinned && (
                      <span
                        className="text-[10px] text-[var(--accent)]"
                        title="Group pinned — members resume on Connect"
                      >
                        📌
                      </span>
                    )}
                    {renamingGroupId === g.id ? (
                      <input
                        value={renameGroupDraft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onRenameGroupDraft(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            onRenameGroup(g.id, renameGroupDraft);
                            onRenamingGroupId(null);
                          } else if (e.key === "Escape") {
                            onRenamingGroupId(null);
                          }
                        }}
                        onBlur={() => {
                          onRenameGroup(g.id, renameGroupDraft);
                          onRenamingGroupId(null);
                        }}
                        className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--bg)] px-1 py-0.5 text-[11px] font-semibold outline-none"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="truncate text-[11px] font-semibold text-[var(--text-muted)]"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onRenamingGroupId(g.id);
                          onRenameGroupDraft(g.name);
                        }}
                        title="Double-click to rename group"
                      >
                        {g.name}
                      </span>
                    )}
                    <span className="mono shrink-0 text-[10px] text-[var(--text-faint)]">
                      {members.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    title={
                      g.pinned
                        ? "Unpin group — members won’t auto-resume"
                        : "Pin group — all members resume on Connect"
                    }
                    onClick={() => onSetGroupPinned(g.id, !g.pinned)}
                    className={`rounded px-1 text-[11px] ${
                      g.pinned
                        ? "text-[var(--accent)]"
                        : "text-[var(--text-faint)] opacity-0 hover:text-[var(--accent)] group-hover/hdr:opacity-100"
                    }`}
                  >
                    📌
                  </button>
                  <button
                    type="button"
                    title="Delete group"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete group “${g.name}”? Sessions stay open and become ungrouped.`,
                        )
                      ) {
                        onDeleteGroup(g.id);
                      }
                    }}
                    className="rounded px-1 text-[10px] text-[var(--text-faint)] opacity-0 hover:text-[var(--danger)] group-hover/hdr:opacity-100"
                  >
                    ✕
                  </button>
                </div>
                {!isCollapsed && (
                  <ul className="mt-0.5 space-y-0.5">
                    {members.length === 0 ? (
                      <li className="px-3 py-1 text-[10px] text-[var(--text-faint)]">
                        Empty — assign a session with the folder menu
                      </li>
                    ) : (
                      members.map((s) => (
                        <SessionRow
                          key={s.sessionId}
                          s={s}
                          selected={s.sessionId === activeId}
                          pinned={isPinned(s.sessionId, s.cwd)}
                          groups={groups}
                          groupId={g.id}
                          onSelectSession={onSelectSession}
                          onCloseSession={onCloseSession}
                          onPin={onPin}
                          onUnpin={onUnpin}
                          onRenameSession={onRenameSession}
                          onSetSessionGroup={onSetSessionGroup}
                        />
                      ))
                    )}
                  </ul>
                )}
              </div>
            );
          })}

          <div>
            {groups.length > 0 && (
              <div className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                Ungrouped
                <span className="mono ml-1 font-normal">
                  {(sessionsByGroup.get(null) ?? []).length}
                </span>
              </div>
            )}
            <ul className="space-y-0.5">
              {(sessionsByGroup.get(null) ?? []).map((s) => (
                <SessionRow
                  key={s.sessionId}
                  s={s}
                  selected={s.sessionId === activeId}
                  pinned={isPinned(s.sessionId, s.cwd)}
                  groups={groups}
                  groupId={null}
                  onSelectSession={onSelectSession}
                  onCloseSession={onCloseSession}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  onRenameSession={onRenameSession}
                  onSetSessionGroup={onSetSessionGroup}
                />
              ))}
              {sessions.length === 0 && (
                <li className="px-2 text-[12px] text-[var(--text-muted)]">
                  No open sessions.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
