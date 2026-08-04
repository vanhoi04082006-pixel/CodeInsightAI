// CodeInsight AI — Stage 2.1: Inline Agent Framework — Public API
export { AgentPanel } from "./agent-panel";
export type { AgentPanelProps } from "./agent-panel";
export { ActionButton, ActionRow } from "./action-button";
export type { ActionButtonProps } from "./action-button";
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
