"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DebugToggle {
  showTokenUsage: boolean;
  showResponseTime: boolean;
  showPromptDebug: boolean;
  showModelDebug: boolean;
  showRawResponse: boolean;
  showRequestLogs: boolean;
  showResponseLogs: boolean;
  showAdvancedDebug: boolean; // embeddings, vector search, chunk ranking, etc.
}

export interface AIRequestLog {
  id: string;
  timestamp: number;
  requestId: string;
  provider: string;
  model: string;
  personality: string;
  durationMs: number;
  queueMs: number;
  generationMs: number;
  status: "success" | "error" | "pending";
  statusCode: number;
  error?: string;
  retryCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface DebugSnapshot {
  requestId: string;
  timestamp: number;
  provider: string;
  model: string;
  personality: string;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  contextWindow: number;
  // prompt construction
  systemPrompt: string;
  userPrompt: string;
  repositoryContext: string;
  retrievedChunks: { path: string; score: number; snippet: string }[];
  finalPrompt: string;
  // token usage
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  // timing
  queueMs: number;
  generationMs: number;
  totalMs: number;
  // model capabilities
  capabilities: {
    vision: boolean;
    toolCalling: boolean;
    functionCalling: boolean;
    reasoning: boolean;
  };
  // raw response (before formatting)
  rawResponse: string;
  formattedResponse: string;
  // advanced
  embeddingResults?: { id: string; score: number }[];
  vectorSearchResults?: { id: string; score: number; content: string }[];
  chunkRanking?: { path: string; rank: number; score: number }[];
  repositoryIndex?: { files: number; chunks: number; embeddings: number };
  dependencyGraphData?: { nodes: number; edges: number; circular: number };
  staticAnalysisOutput?: { issues: number; bugs: number; security: number; performance: number };
  tokenCostEstimate?: { inputCost: number; outputCost: number; totalCost: number; currency: string };
}

interface DeveloperModeState extends DebugToggle {
  enabled: boolean;
  logs: AIRequestLog[];
  snapshots: DebugSnapshot[];
  maxLogs: number;

  setEnabled: (b: boolean) => void;
  setToggle: (k: keyof DebugToggle, v: boolean) => void;
  addLog: (log: AIRequestLog) => void;
  clearLogs: () => void;
  addSnapshot: (snap: DebugSnapshot) => void;
  clearSnapshots: () => void;
  getLatestSnapshot: () => DebugSnapshot | undefined;
}

function newId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export const useDeveloperModeStore = create<DeveloperModeState>()(
  persist(
    (set, get) => ({
      enabled: false,
      showTokenUsage: true,
      showResponseTime: true,
      showPromptDebug: true,
      showModelDebug: true,
      showRawResponse: false,
      showRequestLogs: true,
      showResponseLogs: true,
      showAdvancedDebug: false,
      logs: [],
      snapshots: [],
      maxLogs: 50,

      setEnabled: (b) => set({ enabled: b }),
      setToggle: (k, v) => set({ [k]: v } as Partial<DeveloperModeState>),
      addLog: (log) =>
        set((s) => ({ logs: [log, ...s.logs].slice(0, s.maxLogs) })),
      clearLogs: () => set({ logs: [] }),
      addSnapshot: (snap) =>
        set((s) => ({ snapshots: [snap, ...s.snapshots].slice(0, 10) })),
      clearSnapshots: () => set({ snapshots: [] }),
      getLatestSnapshot: () => get().snapshots[0],
    }),
    {
      name: "codeinsight-ai-developer-mode",
      // don't persist snapshots (they can be large); keep toggles + enabled + logs
      partialize: (s) => ({
        enabled: s.enabled,
        showTokenUsage: s.showTokenUsage,
        showResponseTime: s.showResponseTime,
        showPromptDebug: s.showPromptDebug,
        showModelDebug: s.showModelDebug,
        showRawResponse: s.showRawResponse,
        showRequestLogs: s.showRequestLogs,
        showResponseLogs: s.showResponseLogs,
        showAdvancedDebug: s.showAdvancedDebug,
        logs: s.logs,
      }),
    }
  )
);

export { newId as newRequestId };
