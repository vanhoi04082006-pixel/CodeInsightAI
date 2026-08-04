// CodeInsight AI — Stage 2 + Stage 3: Agent Integration — Public API
export { AgentPanel } from "./agent-panel";
export type { AgentPanelProps } from "./agent-panel";
export { ActionButton, ActionRow } from "./action-button";
export type { ActionButtonProps } from "./action-button";
export { WorkspaceView } from "./workspace-view";
export { useAgent } from "./use-agent";
export type { AgentState, ChatMessage, ToolCallEntry, PendingPermission } from "./use-agent";
export {
  contextToQuery,
  issueContext,
  symbolContext,
  tabContext,
} from "@/lib/agent-integration/context-adapter";
export type {
  AgentAction,
  AgentTabId,
  AgentItemContext,
  AgentQuery,
} from "@/lib/agent-integration/context-adapter";
