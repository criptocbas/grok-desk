import { useMemo, useState } from "react";
import type {
  DeskSession,
  DiskSession,
  SessionGroup,
  SessionPin,
} from "../../types";
import {
  countRunningBackground,
  countRunningSubagents,
  countRunningTools,
} from "../../activity";
import { CollapsedRail } from "./navigator/CollapsedRail";
import { PinsSection } from "./navigator/PinsSection";
import { OpenSessionsSection } from "./navigator/OpenSessionsSection";
import { RecentsSection } from "./navigator/RecentsSection";

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

/**
 * Left mission-control rail — composition only.
 * Section UIs live under `navigator/*`.
 */
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
      <CollapsedRail
        running={running}
        connecting={connecting}
        grokAvailable={grokAvailable}
        headerStatus={headerStatus}
        active={active}
        sessions={sessions}
        activeId={activeId}
        pins={pins}
        isPinned={isPinned}
        onToggleCollapse={onToggleCollapse}
        onConnect={onConnect}
        onSelectSession={onSelectSession}
        onToggleRecents={onToggleRecents}
      />
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
        <PinsSection
          pins={pins}
          pinSections={pinSections}
          sessions={sessions}
          activeId={activeId}
          resumingPins={resumingPins}
          dragPinId={dragPinId}
          onDragPinId={setDragPinId}
          onPinDrop={onPinDrop}
          onReorderPins={onReorderPins}
          onSelectSession={onSelectSession}
          onResumePin={onResumePin}
          onUnpin={onUnpin}
          onRenameSession={onRenameSession}
        />

        <OpenSessionsSection
          sessions={sessions}
          groups={groups}
          sessionsByGroup={sessionsByGroup}
          activeId={activeId}
          isPinned={isPinned}
          newGroupOpen={newGroupOpen}
          newGroupName={newGroupName}
          onNewGroupOpen={setNewGroupOpen}
          onNewGroupName={setNewGroupName}
          onCreateGroup={onCreateGroup}
          renamingGroupId={renamingGroupId}
          renameGroupDraft={renameGroupDraft}
          onRenamingGroupId={setRenamingGroupId}
          onRenameGroupDraft={setRenameGroupDraft}
          onRenameGroup={onRenameGroup}
          onDeleteGroup={onDeleteGroup}
          onSetGroupCollapsed={onSetGroupCollapsed}
          onSetGroupPinned={onSetGroupPinned}
          onSelectSession={onSelectSession}
          onCloseSession={onCloseSession}
          onPin={onPin}
          onUnpin={onUnpin}
          onRenameSession={onRenameSession}
          onSetSessionGroup={onSetSessionGroup}
        />

        <RecentsSection
          show={showRecents}
          diskSessions={diskSessions}
          running={running}
          grokAvailable={grokAvailable}
          isPinned={isPinned}
          onResumeDisk={onResumeDisk}
          onRenameSession={onRenameSession}
          onPin={onPin}
          onUnpin={onUnpin}
        />
      </div>

      {active &&
        (active.busy ||
          countRunningTools(active.tools) > 0 ||
          countRunningBackground(active.backgroundTasks ?? []) > 0 ||
          countRunningSubagents(active.subagents ?? []) > 0) && (
          <div className="border-t border-[var(--border)] px-3 py-2 text-[10px] text-[var(--warning)]">
            {active.busy
              ? "Turn running"
              : countRunningSubagents(active.subagents ?? []) > 0
                ? "Watching"
                : "Tools active"}
            {countRunningSubagents(active.subagents ?? []) > 0
              ? ` · ${countRunningSubagents(active.subagents ?? [])} sub`
              : ""}
            {countRunningTools(active.tools) > 0
              ? ` · ${countRunningTools(active.tools)} tool${countRunningTools(active.tools) === 1 ? "" : "s"}`
              : ""}
            {countRunningBackground(active.backgroundTasks ?? []) > 0
              ? ` · ${countRunningBackground(active.backgroundTasks ?? [])} bg`
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
