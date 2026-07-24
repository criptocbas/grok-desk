import { useCallback, useEffect, useState } from "react";
import type { InspectorTab } from "../components/InspectorRail";
import { loadTerminalOpen } from "../components/terminal/TerminalDock";
import {
  loadFileTreeOpen,
  saveFileTreeOpen,
} from "../components/files/FileTreePane";

/**
 * Layout chrome: rails, terminal, file tree, palette/help open flags.
 * Keyboard handlers stay in App and call these setters/toggles.
 */
export function useLayoutChrome() {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(loadTerminalOpen);
  const [fileTreeOpen, setFileTreeOpen] = useState(loadFileTreeOpen);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const [shellEpoch, setShellEpoch] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("grok-desk.sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showRecents, setShowRecents] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        "grok-desk.sidebarCollapsed",
        sidebarCollapsed ? "1" : "0",
      );
    } catch {
      /* private mode */
    }
  }, [sidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v);
  }, []);

  const toggleFileTree = useCallback(() => {
    setFileTreeOpen((v) => {
      const next = !v;
      saveFileTreeOpen(next);
      return next;
    });
  }, []);

  const closeFileTree = useCallback(() => {
    setFileTreeOpen(false);
    saveFileTreeOpen(false);
  }, []);

  return {
    inspectorTab,
    setInspectorTab,
    terminalOpen,
    setTerminalOpen,
    fileTreeOpen,
    setFileTreeOpen,
    closeFileTree,
    terminalFocused,
    setTerminalFocused,
    shellEpoch,
    setShellEpoch,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    toggleFileTree,
    showShortcuts,
    setShowShortcuts,
    showPalette,
    setShowPalette,
    showRecents,
    setShowRecents,
  };
}
