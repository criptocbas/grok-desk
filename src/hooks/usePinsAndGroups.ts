import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionGroupsState, SessionPin } from "../types";

/**
 * Desk pin bookmarks + session groups (persisted under ~/.config/grok-desk).
 * Does not own agent resume — App/actions call refresh* then resume.
 * Pin→tab title adoption stays in App (needs setSessions batch).
 */
export function usePinsAndGroups(opts: {
  /** Live open-session lookup for group pin cwd/title. */
  getOpenSession: (
    sessionId: string,
  ) => { cwd: string; title: string } | undefined;
  onError: (message: string) => void;
}) {
  const { getOpenSession, onError } = opts;

  const [pins, setPins] = useState<SessionPin[]>([]);
  const [resumingPins, setResumingPins] = useState(false);
  const pinsRestoredRef = useRef(false);
  const [sessionGroups, setSessionGroups] = useState<SessionGroupsState>({
    groups: [],
    membership: {},
  });

  const applyGroupsState = useCallback((state: SessionGroupsState) => {
    setSessionGroups({
      groups: state.groups ?? [],
      membership: state.membership ?? {},
      sessionRefs: state.sessionRefs ?? {},
    });
  }, []);

  const refreshPins = useCallback(async () => {
    try {
      const list = await invoke<SessionPin[]>("list_pins");
      setPins(list);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshGroups = useCallback(async () => {
    try {
      const state = await invoke<SessionGroupsState>("list_session_groups");
      applyGroupsState(state);
    } catch {
      /* ignore */
    }
  }, [applyGroupsState]);

  const isPinned = useCallback(
    (sessionId: string, cwd?: string) =>
      pins.some(
        (p) =>
          p.sessionId === sessionId &&
          (cwd == null || cwd === "" || p.cwd === cwd),
      ),
    [pins],
  );

  const pinSession = useCallback(
    async (sessionId: string, cwd: string, title?: string | null) => {
      try {
        const list = await invoke<SessionPin[]>("pin_session", {
          sessionId,
          cwd,
          title: title || null,
        });
        setPins(list);
      } catch (e) {
        onError(String(e));
      }
    },
    [onError],
  );

  const unpinSession = useCallback(
    async (sessionId: string, cwd?: string) => {
      try {
        const list = await invoke<SessionPin[]>("unpin_session", {
          sessionId,
          cwd: cwd || null,
        });
        setPins(list);
      } catch (e) {
        onError(String(e));
      }
    },
    [onError],
  );

  const reorderPins = useCallback(
    async (sessionIds: string[]) => {
      try {
        const list = await invoke<SessionPin[]>("reorder_pins", { sessionIds });
        setPins(list);
      } catch (e) {
        onError(String(e));
      }
    },
    [onError],
  );

  const createGroup = useCallback(
    async (name: string) => {
      try {
        applyGroupsState(
          await invoke<SessionGroupsState>("create_session_group", { name }),
        );
      } catch (e) {
        onError(String(e));
      }
    },
    [applyGroupsState, onError],
  );

  const renameGroup = useCallback(
    async (groupId: string, name: string) => {
      try {
        applyGroupsState(
          await invoke<SessionGroupsState>("rename_session_group", {
            groupId,
            name,
          }),
        );
      } catch (e) {
        onError(String(e));
      }
    },
    [applyGroupsState, onError],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      try {
        applyGroupsState(
          await invoke<SessionGroupsState>("delete_session_group", {
            groupId,
          }),
        );
      } catch (e) {
        onError(String(e));
      }
    },
    [applyGroupsState, onError],
  );

  const setGroupCollapsed = useCallback(
    async (groupId: string, collapsed: boolean) => {
      try {
        applyGroupsState(
          await invoke<SessionGroupsState>("set_group_collapsed", {
            groupId,
            collapsed,
          }),
        );
      } catch (e) {
        onError(String(e));
      }
    },
    [applyGroupsState, onError],
  );

  const setSessionGroup = useCallback(
    async (sessionId: string, groupId: string | null) => {
      try {
        const sess = getOpenSession(sessionId);
        applyGroupsState(
          await invoke<SessionGroupsState>("set_session_group", {
            sessionId,
            groupId,
            cwd: sess?.cwd ?? null,
            title: sess?.title ?? null,
          }),
        );
      } catch (e) {
        onError(String(e));
      }
    },
    [applyGroupsState, getOpenSession, onError],
  );

  const setGroupPinned = useCallback(
    async (groupId: string, pinned: boolean) => {
      try {
        if (pinned) {
          const members = Object.entries(sessionGroups.membership)
            .filter(([, gid]) => gid === groupId)
            .map(([sid]) => sid);
          for (const sid of members) {
            const sess = getOpenSession(sid);
            if (sess) {
              try {
                await invoke("touch_session_ref", {
                  sessionId: sid,
                  cwd: sess.cwd,
                  title: sess.title ?? null,
                });
              } catch {
                /* ignore */
              }
            }
          }
        }
        applyGroupsState(
          await invoke<SessionGroupsState>("set_group_pinned", {
            groupId,
            pinned,
          }),
        );
      } catch (e) {
        onError(String(e));
      }
    },
    [applyGroupsState, getOpenSession, onError, sessionGroups.membership],
  );

  return {
    pins,
    setPins,
    resumingPins,
    setResumingPins,
    pinsRestoredRef,
    sessionGroups,
    setSessionGroups,
    applyGroupsState,
    refreshPins,
    refreshGroups,
    isPinned,
    pinSession,
    unpinSession,
    reorderPins,
    createGroup,
    renameGroup,
    deleteGroup,
    setGroupCollapsed,
    setSessionGroup,
    setGroupPinned,
  };
}
