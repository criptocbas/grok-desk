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
