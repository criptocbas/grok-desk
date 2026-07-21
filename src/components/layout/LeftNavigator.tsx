import { useMemo, useState } from "react";
import type {
  DeskSession,
  DiskSession,
  SessionGroup,
  SessionPin,
} from "../../types";
import {
  countRunningBackground,
  countRunningTools,
} from "../../activity";
import { folderName, formatTime, shortId } from "../../lib/format";
import { SessionTitleLabel } from "../session/SessionTitleLabel";

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  running: boolean;
  connecting: boolean;
  grokAvailable: boolean;
  headerStatus: string;
  cwd: string;
  onCwdChange: (cwd: string) => void;
  onBrowseFolder: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenSession: () => void;
  sessions: DeskSession[];
  activeId: string | null;
  onSelectSession: (sessionId: string, cwd: string) => void;
  onCloseSession: (sessionId: string) => void;
  pins: SessionPin[];
  resumingPins: boolean;
  isPinned: (sessionId: string, cwd?: string) => boolean;
  onPin: (sessionId: string, cwd: string, title?: string | null) => void;
  onUnpin: (sessionId: string, cwd?: string) => void;
  onResumePin: (pin: SessionPin) => void;
  /** Reorder pin list (full sessionId order). */
  onReorderPins?: (sessionIds: string[]) => void;
  /** Persist a custom display name for a session. */
  onRenameSession: (sessionId: string, title: string) => void;
  groups: SessionGroup[];
  groupMembership: Record<string, string>;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSetGroupCollapsed: (groupId: string, collapsed: boolean) => void;
  onSetSessionGroup: (sessionId: string, groupId: string | null) => void;
  onSetGroupPinned: (groupId: string, pinned: boolean) => void;
  showRecents: boolean;
  onToggleRecents: () => void;
  diskSessions: DiskSession[];
  onResumeDisk: (d: DiskSession) => void;
  stderrTail: string[];
  active: DeskSession | null;
};

export function LeftNavigator({
  collapsed,
  onToggleCollapse,
  running,
  connecting,
  grokAvailable,
  headerStatus,
  cwd,
  onCwdChange,
  onBrowseFolder,
  onConnect,
  onDisconnect,
  onOpenSession,
  sessions,
  activeId,
  onSelectSession,
  onCloseSession,
  pins,
  resumingPins,
  isPinned,
  onPin,
  onUnpin,
  onResumePin,
  onReorderPins,
  onRenameSession,
  groups,
  groupMembership,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onSetGroupCollapsed,
  onSetSessionGroup,
  onSetGroupPinned,
  showRecents,
  onToggleRecents,
  diskSessions,
  onResumeDisk,
  stderrTail,
  active,
}: Props) {
  const [dragPinId, setDragPinId] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupDraft, setRenameGroupDraft] = useState("");

  const sessionsByGroup = useMemo(() => {
    const map = new Map<string | null, DeskSession[]>();
    map.set(null, []);
    for (const g of groups) map.set(g.id, []);
    for (const s of sessions) {
      const gid = groupMembership[s.sessionId] ?? null;
      const key = gid && map.has(gid) ? gid : null;
      map.get(key)!.push(s);
    }
    return map;
  }, [sessions, groups, groupMembership]);

  /** Pinned sessions bucketed by group (group order, then ungrouped). */
  const pinSections = useMemo(() => {
    const buckets = new Map<string | null, SessionPin[]>();
    for (const g of groups) buckets.set(g.id, []);
    buckets.set(null, []);
    for (const p of pins) {
      const gid = groupMembership[p.sessionId];
      const key = gid && buckets.has(gid) ? gid : null;
      buckets.get(key)!.push(p);
    }
    const sections: {
      groupId: string | null;
      label: string | null;
      items: SessionPin[];
    }[] = [];
    for (const g of groups) {
      const items = buckets.get(g.id) ?? [];
      if (items.length > 0) {
        sections.push({ groupId: g.id, label: g.name, items });
      }
    }
    const ungrouped = buckets.get(null) ?? [];
    if (ungrouped.length > 0) {
      sections.push({
        groupId: null,
        // Only label “Ungrouped” when some pins are also in named groups
        label: sections.length > 0 ? "Ungrouped" : null,
        items: ungrouped,
      });
    }
    return sections;
  }, [pins, groups, groupMembership]);

  const onPinDrop = (targetId: string) => {
    if (!onReorderPins || !dragPinId || dragPinId === targetId) {
      setDragPinId(null);
      return;
    }
    const ids = pins.map((p) => p.sessionId);
    const from = ids.indexOf(dragPinId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragPinId(null);
      return;
    }
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragPinId);
    onReorderPins(next);
    setDragPinId(null);
  };

  if (collapsed) {
    return (
      <aside
        className="flex w-12 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--bg-panel)] py-2"
        aria-label="Collapsed sidebar"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expand sidebar (Ctrl+B / Alt+B)"
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          ›
        </button>
        <div
          className={`mb-2 h-2 w-2 rounded-full ${
            running
              ? active?.busy
                ? "status-pulse bg-[var(--warning)]"
                : "bg-[var(--success)]"
              : "bg-[var(--text-faint)]"
          }`}
          title={headerStatus}
        />
        {!running ? (
          <button
            type="button"
            onClick={() => void onConnect()}
            disabled={connecting || !grokAvailable}
            title="Connect"
            className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-xs font-bold text-[var(--accent-fg)] disabled:opacity-40"
          >
            {connecting ? "…" : "C"}
          </button>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
          {sessions.map((s) => {
            const selected = s.sessionId === activeId;
            const run = countRunningTools(s.tools);
            return (
              <button
                key={s.sessionId}
                type="button"
                title={`${s.title}\n${s.cwd}`}
                onClick={() => onSelectSession(s.sessionId, s.cwd)}
                className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${
                  selected
                    ? "bg-[var(--bg-active)] text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                }`}
              >
                {(s.title || folderName(s.cwd)).slice(0, 1).toUpperCase()}
                {s.busy || run > 0 ? (
                  <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
                ) : isPinned(s.sessionId, s.cwd) ? (
                  <span className="absolute bottom-0.5 right-0.5 text-[7px] text-[var(--accent)]">
                    •
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {pins.length > 0 && sessions.length === 0 && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={`${pins.length} pinned — expand to open`}
            className="mb-1 text-[10px] text-[var(--accent)]"
          >
            📌{pins.length}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleRecents}
          title="Recents"
          className="mt-auto flex h-8 w-8 items-center justify-center rounded-md text-[10px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        >
          ☰
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[17.5rem] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
      <div className="space-y-2.5 border-b border-[var(--border)] p-3">
        <div className="flex gap-1.5">
          {!running ? (
            <button
              type="button"
              onClick={onConnect}
              disabled={connecting || !grokAvailable}
              className="flex-1 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-40"
            >
              {connecting ? "Connecting…" : "Connect"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onDisconnect}
              className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
            >
              Disconnect
            </button>
          )}
          <button
            type="button"
            onClick={onToggleRecents}
            className={`rounded-md border px-3 py-2 text-sm ${
              showRecents
                ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] hover:border-[var(--accent)]"
            }`}
            title="Recent sessions on disk"
          >
            Recents
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse sidebar (Ctrl+B / Alt+B) — focus mode"
            className="rounded-md border border-[var(--border)] px-2.5 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            ‹
          </button>
        </div>

        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
          Project
        </div>
        <div className="flex gap-1">
          <input
            value={cwd}
            onChange={(e) => onCwdChange(e.target.value)}
            title={cwd}
            className="mono min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[11px] outline-none focus:border-[var(--accent)]"
            placeholder="/path/to/project"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void onBrowseFolder()}
            title="Choose folder"
            className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm hover:border-[var(--accent)]"
          >
            …
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenSession}
          disabled={!cwd}
          className="w-full rounded-md border border-dashed border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 disabled:opacity-40"
        >
          + New session
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
              Pin a session to reopen it automatically after restart. Use 📌 on
              a tab or in Recents. Assign a group under Open to organize pins.
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
                      const open = sessions.some(
                        (s) => s.sessionId === p.sessionId,
                      );
                      const selected = p.sessionId === activeId;
                      return (
                        <li
                          key={`${p.sessionId}:${p.cwd}`}
                          draggable={!!onReorderPins}
                          onDragStart={() => setDragPinId(p.sessionId)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onPinDrop(p.sessionId)}
                          onDragEnd={() => setDragPinId(null)}
                          className={
                            dragPinId === p.sessionId
                              ? "opacity-50"
                              : undefined
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
                                    title={p.title || folderName(p.cwd)}
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
                              onClick={() =>
                                void onUnpin(p.sessionId, p.cwd)
                              }
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
                setNewGroupOpen((v) => !v);
                setNewGroupName("");
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
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newGroupName.trim()) {
                  onCreateGroup(newGroupName.trim());
                  setNewGroupName("");
                  setNewGroupOpen(false);
                } else if (e.key === "Escape") {
                  setNewGroupOpen(false);
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
                setNewGroupName("");
                setNewGroupOpen(false);
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
                          onChange={(e) => setRenameGroupDraft(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") {
                              onRenameGroup(g.id, renameGroupDraft);
                              setRenamingGroupId(null);
                            } else if (e.key === "Escape") {
                              setRenamingGroupId(null);
                            }
                          }}
                          onBlur={() => {
                            onRenameGroup(g.id, renameGroupDraft);
                            setRenamingGroupId(null);
                          }}
                          className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--bg)] px-1 py-0.5 text-[11px] font-semibold outline-none"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="truncate text-[11px] font-semibold text-[var(--text-muted)]"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setRenamingGroupId(g.id);
                            setRenameGroupDraft(g.name);
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

        {showRecents && (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              From disk
            </div>
            <ul className="space-y-1">
              {diskSessions.slice(0, 15).map((d) => {
                const pinned = isPinned(d.sessionId, d.cwd);
                return (
                  <li
                    key={d.sessionId}
                    className="group flex items-start gap-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => void onResumeDisk(d)}
                      disabled={!running && !grokAvailable}
                      className="min-w-0 flex-1 rounded-md px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] disabled:opacity-40"
                    >
                      <div className="flex items-center gap-1 truncate text-[11px] font-medium">
                        {pinned && (
                          <span className="text-[var(--accent)]">📌</span>
                        )}
                        <SessionTitleLabel
                          title={d.title || folderName(d.cwd)}
                          className="text-[11px] font-medium"
                          onRename={(next) =>
                            onRenameSession(d.sessionId, next)
                          }
                        />
                      </div>
                      <div className="mono truncate text-[10px] text-[var(--text-muted)]">
                        {folderName(d.cwd)} · {formatTime(d.updatedAt)}
                      </div>
                    </button>
                    <button
                      type="button"
                      title={pinned ? "Unpin" : "Pin session"}
                      onClick={() => {
                        if (pinned) {
                          void onUnpin(d.sessionId, d.cwd);
                        } else {
                          void onPin(
                            d.sessionId,
                            d.cwd,
                            d.title || folderName(d.cwd),
                          );
                        }
                      }}
                      className={`mt-2 shrink-0 rounded px-1.5 text-[11px] ${
                        pinned
                          ? "text-[var(--accent)]"
                          : "text-[var(--text-faint)] opacity-0 group-hover:opacity-100 hover:text-[var(--accent)]"
                      }`}
                    >
                      📌
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Live status chip — full Activity lives in the right utility rail */}
      {active && (active.busy || countRunningTools(active.tools) > 0) && (
        <div className="border-t border-[var(--border)] px-3 py-2 text-[10px] text-[var(--warning)]">
          {active.busy ? "Turn running" : "Tools active"}
          {countRunningTools(active.tools) > 0
            ? ` · ${countRunningTools(active.tools)} tool${countRunningTools(active.tools) === 1 ? "" : "s"}`
            : ""}
          <span className="text-[var(--text-faint)]"> · Alt+A</span>
        </div>
      )}

      {stderrTail.length > 0 && (
        <details className="border-t border-[var(--border)] p-2 text-[10px] text-[var(--text-muted)]">
          <summary className="cursor-pointer text-[var(--text-faint)]">
            Agent stderr
          </summary>
          <pre className="mono mt-1 max-h-24 overflow-auto whitespace-pre-wrap">
            {stderrTail.slice(-10).join("\n")}
          </pre>
        </details>
      )}
    </aside>
  );
}

function SessionRow({
  s,
  selected,
  pinned,
  groups,
  groupId,
  onSelectSession,
  onCloseSession,
  onPin,
  onUnpin,
  onRenameSession,
  onSetSessionGroup,
}: {
  s: DeskSession;
  selected: boolean;
  pinned: boolean;
  groups: SessionGroup[];
  groupId: string | null;
  onSelectSession: (sessionId: string, cwd: string) => void;
  onCloseSession: (sessionId: string) => void;
  onPin: (sessionId: string, cwd: string, title?: string | null) => void;
  onUnpin: (sessionId: string, cwd?: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSetSessionGroup: (sessionId: string, groupId: string | null) => void;
}) {
  const statusLabel = s.busy
    ? "busy"
    : s.permissions.length
      ? "needs permission"
      : s.permissionMode === "always-approve"
        ? "always-approve"
        : "ready";

  return (
    <li>
      <div
        className={`group flex w-full items-start gap-1 rounded-lg px-1 py-1 transition ${
          selected
            ? "bg-[var(--bg-active)] ring-1 ring-[var(--accent)]/35"
            : "hover:bg-[var(--bg-hover)]"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectSession(s.sessionId, s.cwd)}
          aria-current={selected ? "true" : undefined}
          aria-label={`${s.title}, ${statusLabel}`}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1.5 py-1 text-left"
        >
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              s.busy
                ? "status-pulse bg-[var(--warning)]"
                : s.permissions.length
                  ? "bg-[var(--danger)]"
                  : s.permissionMode === "always-approve"
                    ? "bg-[var(--warning)]"
                    : "bg-[var(--success)]"
            }`}
            title={statusLabel}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 truncate text-[11px] font-medium">
              {pinned && (
                <span
                  className="text-[10px] text-[var(--accent)]"
                  title="Pinned"
                  aria-hidden
                >
                  📌
                </span>
              )}
              <SessionTitleLabel
                title={s.title}
                className="text-[11px] font-medium"
                onRename={(next) => onRenameSession(s.sessionId, next)}
              />
            </div>
            <div className="mono truncate text-[10px] text-[var(--text-faint)]">
              {folderName(s.cwd)}
              {(() => {
                const run = countRunningTools(s.tools);
                const bg = countRunningBackground(s.backgroundTasks ?? []);
                if (run > 0) return ` · ${run} run`;
                if (bg > 0) return ` · ${bg} bg`;
                if (s.plan.length > 0)
                  return ` · plan ${s.plan.filter((e) => e.status === "completed").length}/${s.plan.length}`;
                return "";
              })()}
            </div>
          </div>
        </button>
        {groups.length > 0 && (
          <select
            title="Move to group"
            aria-label="Move session to group"
            value={groupId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onSetSessionGroup(s.sessionId, v === "" ? null : v);
            }}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 max-w-[4.5rem] shrink-0 rounded border border-transparent bg-transparent py-0.5 text-[10px] text-[var(--text-faint)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:border-[var(--border)]"
          >
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          title={pinned ? "Unpin" : "Pin (keep after restart)"}
          aria-label={pinned ? "Unpin session" : "Pin session"}
          onClick={() => {
            if (pinned) void onUnpin(s.sessionId, s.cwd);
            else void onPin(s.sessionId, s.cwd, s.title);
          }}
          className={`mt-1 shrink-0 rounded px-1.5 py-0.5 text-[11px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${
            pinned
              ? "text-[var(--accent)] opacity-100"
              : "text-[var(--text-faint)] hover:text-[var(--accent)]"
          }`}
        >
          📌
        </button>
        <button
          type="button"
          title="Close tab"
          aria-label="Close session"
          onClick={() => onCloseSession(s.sessionId)}
          className="mt-1 shrink-0 rounded px-1.5 py-0.5 text-[var(--text-faint)] opacity-0 hover:bg-[var(--bg-hover)] hover:text-[var(--danger)] group-hover:opacity-100 focus-visible:opacity-100"
        >
          ×
        </button>
      </div>
    </li>
  );
}
