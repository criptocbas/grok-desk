export type GrokStatus = {
  available: boolean;
  path: string | null;
  version: string | null;
};

export type EffortOption = {
  id: string;
  value: string;
  label: string;
  description?: string | null;
};

export type ModelOption = {
  modelId: string;
  name: string;
  description?: string | null;
  supportsReasoningEffort?: boolean;
  reasoningEffort?: string | null;
  reasoningEfforts?: EffortOption[];
};

export type AgentInfo = {
  agentVersion: string | null;
  modelId: string | null;
  subscriptionTier: string | null;
  authEmail: string | null;
  availableModels?: ModelOption[];
  reasoningEffort?: string | null;
};

export type SessionInfo = {
  sessionId: string;
  cwd: string;
  modelId: string | null;
  title?: string | null;
  updatedAt?: string | null;
  fromDisk?: boolean;
  reasoningEffort?: string | null;
  availableModels?: ModelOption[];
};

export type DiskSession = {
  sessionId: string;
  cwd: string;
  title: string | null;
  modelId: string | null;
  updatedAt: string | null;
  numChatMessages: number | null;
};

/** Desk bookmark — persists across app restarts (`~/.config/grok-desk/pins.json`). */
export type SessionPin = {
  sessionId: string;
  cwd: string;
  title?: string | null;
  pinnedAt?: string | null;
  /** Session no longer found under ~/.grok/sessions */
  missing?: boolean;
};

/** Named folder for organizing sessions (`~/.config/grok-desk/session-groups.json`). */
export type SessionGroup = {
  id: string;
  name: string;
  collapsed?: boolean;
  /** When true, all members auto-resume on Connect. */
  pinned?: boolean;
};

export type SessionRef = {
  cwd: string;
  title?: string | null;
};

export type SessionGroupsState = {
  groups: SessionGroup[];
  /** sessionId → groupId */
  membership: Record<string, string>;
  /** sessionId → last known cwd/title (for group-pin resume) */
  sessionRefs?: Record<string, SessionRef>;
};

/** Session to open because its group is pinned. */
export type GroupResumeTarget = {
  sessionId: string;
  cwd: string;
  title?: string | null;
  groupId: string;
  groupName: string;
};

export type PermissionOption = {
  optionId: string;
  name: string;
  kind: string;
};

export type PermissionRequest = {
  requestId: number;
  sessionId: string | null;
  toolCall: unknown;
  options: PermissionOption[];
  raw: unknown;
};

export type ChatRole = "user" | "assistant" | "system" | "thought" | "tool";

export type ChatItem = {
  id: string;
  role: ChatRole;
  text: string;
  meta?: string;
  status?: string;
};

export type ToolCallItem = {
  id: string;
  title: string;
  /** ACP kind: read | search | execute | edit | … */
  kind?: string;
  /** Canonical tool name from _meta x.ai/tool.name when present */
  name?: string;
  status: string;
  /** Epoch ms */
  startedAt?: number;
  endedAt?: number;
  /** One-line context: path, command snippet, subagent description */
  detail?: string;
  /** Classified category for UI grouping */
  category?: "tool" | "subagent" | "background" | "other";
  locations?: { path: string }[];
  /** Last slim update payload (not full logs) */
  raw?: unknown;
};

/** Long-running shell/subagent work advertised via task_backgrounded / task_completed. */
export type BackgroundTaskItem = {
  taskId: string;
  toolCallId?: string;
  description?: string;
  command?: string;
  cwd?: string;
  outputFile?: string;
  status: "running" | "completed" | "failed" | "unknown";
  startedAt?: number;
  endedAt?: number;
  /** Truncated exit summary only (≤300 chars) */
  summary?: string;
};

export type PlanEntryStatus = "pending" | "in_progress" | "completed" | string;
export type PlanEntryPriority = "high" | "medium" | "low" | string;

export type PlanEntry = {
  content: string;
  priority: PlanEntryPriority;
  status: PlanEntryStatus;
};

/** Desk-side permission policy for a session tab. */
export type PermissionMode = "default" | "always-approve";

/** Prompt waiting while the session is mid-turn. */
export type QueuedPrompt = {
  id: string;
  /** Text sent to the agent (may include review comments). */
  text: string;
  /** Short label shown in the queue strip / transcript. */
  displayText: string;
  images: {
    mimeType: string;
    data: string;
    name: string;
  }[];
};

/** Slash command or skill advertised via ACP available_commands_update. */
export type AvailableCommand = {
  name: string;
  description?: string | null;
  /** Optional argument hint from ACP `input.hint`. */
  inputHint?: string | null;
};

/** One open tab in the mission-control sidebar. */
export type DeskSession = {
  sessionId: string;
  cwd: string;
  title: string;
  modelId?: string | null;
  /** Reasoning effort for the active model (low/medium/high/…). */
  reasoningEffort?: string | null;
  availableModels?: ModelOption[];
  /** Client-side tool permission policy for this tab. */
  permissionMode?: PermissionMode;
  /** Prompts to run when the current turn finishes. */
  promptQueue: QueuedPrompt[];
  /** Slash commands / skills from ACP (per session). */
  availableCommands: AvailableCommand[];
  items: ChatItem[];
  tools: ToolCallItem[];
  /** Background shell / task_id work for this session. */
  backgroundTasks: BackgroundTaskItem[];
  permissions: PermissionRequest[];
  busy: boolean;
  createdAt: number;
  /** Epoch ms of last ACP session update (for stall detection). */
  lastActivityAt?: number;
  /** Live agent plan (ACP sessionUpdate: plan / todo_write). */
  plan: PlanEntry[];
  /** e.g. "plan" | "default" | "always-approve" from current_mode_update */
  modeId?: string | null;
  /** Optional long-form plan.md from disk */
  planDoc?: string | null;
  /** Pending review comments to inject on next send */
  reviewComments: ReviewComment[];
  /** Pending ACP plan approval (x.ai/exit_plan_mode) */
  planApproval?: PlanApprovalRequest | null;
};

/** Agent finished planning — Desk must answer approved/cancelled/abandoned. */
export type PlanApprovalRequest = {
  requestId: number;
  sessionId: string;
  toolCallId?: string | null;
  planContent?: string | null;
};

export type GitFileStatus = {
  path: string;
  /** e.g. M, A, D, ??, MM */
  status: string;
};

export type GitDiffResult = {
  path: string | null;
  patch: string;
  isRepo: boolean;
  error?: string | null;
};

export type ReviewComment = {
  id: string;
  path: string;
  /** 1-based line in the new file side when known; optional for whole-file notes */
  startLine?: number | null;
  endLine?: number | null;
  body: string;
  /** Optional snippet of the line(s) being commented */
  snippet?: string | null;
};

/** From `app_version_info` — build + optional install-local.sh meta. */
export type InstallMeta = {
  version?: string | null;
  commit?: string | null;
  commitShort?: string | null;
  branch?: string | null;
  repoPath?: string | null;
  installedAt?: string | null;
  binaryPath?: string | null;
  githubRepo?: string | null;
  githubBranch?: string | null;
};

export type AppVersionInfo = {
  version: string;
  commit: string;
  commitShort: string;
  isInstalled: boolean;
  installMeta?: InstallMeta | null;
  repoPath?: string | null;
};

export type UpdateCheckResult = {
  updateAvailable: boolean;
  currentCommit: string;
  currentCommitShort: string;
  remoteCommit?: string | null;
  remoteCommitShort?: string | null;
  remoteMessage?: string | null;
  githubRepo: string;
  githubBranch: string;
  error?: string | null;
  canAutoUpdate: boolean;
};

export type UpdateStartResult = {
  started: boolean;
  message: string;
  logPath?: string | null;
};
