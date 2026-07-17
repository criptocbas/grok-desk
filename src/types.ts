export type GrokStatus = {
  available: boolean;
  path: string | null;
  version: string | null;
};

export type AgentInfo = {
  agentVersion: string | null;
  modelId: string | null;
  subscriptionTier: string | null;
  authEmail: string | null;
};

export type SessionInfo = {
  sessionId: string;
  cwd: string;
  modelId: string | null;
  title?: string | null;
  updatedAt?: string | null;
  fromDisk?: boolean;
};

export type DiskSession = {
  sessionId: string;
  cwd: string;
  title: string | null;
  modelId: string | null;
  updatedAt: string | null;
  numChatMessages: number | null;
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
  kind?: string;
  status: string;
  raw?: unknown;
};

export type PlanEntryStatus = "pending" | "in_progress" | "completed" | string;
export type PlanEntryPriority = "high" | "medium" | "low" | string;

export type PlanEntry = {
  content: string;
  priority: PlanEntryPriority;
  status: PlanEntryStatus;
};

/** One open tab in the mission-control sidebar. */
export type DeskSession = {
  sessionId: string;
  cwd: string;
  title: string;
  modelId?: string | null;
  items: ChatItem[];
  tools: ToolCallItem[];
  permissions: PermissionRequest[];
  busy: boolean;
  createdAt: number;
  /** Live agent plan (ACP sessionUpdate: plan / todo_write). */
  plan: PlanEntry[];
  /** e.g. "plan" | "default" | "always-approve" from current_mode_update */
  modeId?: string | null;
  /** Optional long-form plan.md from disk */
  planDoc?: string | null;
  /** Pending review comments to inject on next send */
  reviewComments: ReviewComment[];
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
