"use client";

import { create } from "zustand";
import type { AnalysisReport, ChatMessage, View } from "@/lib/types";

interface AppState {
  // Navigation
  view: View;
  setView: (v: View) => void;

  // Active analysis
  activeReport: AnalysisReport | null;
  setActiveReport: (r: AnalysisReport | null) => void;
  activeAnalysisId: string | null;
  setActiveAnalysisId: (id: string | null) => void;

  // Analysis flow
  isAnalyzing: boolean;
  currentStage: number;
  setAnalyzing: (b: boolean) => void;
  setStage: (i: number) => void;

  // Chat history (per active analysis, ephemeral)
  chat: ChatMessage[];
  pushChat: (m: ChatMessage) => void;
  setChat: (m: ChatMessage[]) => void;
  clearChat: () => void;

  // UI
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  commandOpen: boolean;
  setCommandOpen: (b: boolean) => void;

  // Pending repo URL (pre-fills analyze input when navigating from dashboard)
  pendingRepoUrl: string | null;
  setPendingRepoUrl: (url: string | null) => void;
  consumePendingRepoUrl: () => string | null;
}

export const useAppStore = create<AppState>((set) => ({
  view: "landing",
  setView: (v) => set({ view: v }),

  activeReport: null,
  setActiveReport: (r) => set({ activeReport: r }),
  activeAnalysisId: null,
  setActiveAnalysisId: (id) => set({ activeAnalysisId: id }),

  isAnalyzing: false,
  currentStage: 0,
  setAnalyzing: (b) => set({ isAnalyzing: b }),
  setStage: (i) => set({ currentStage: i }),

  chat: [],
  pushChat: (m) => set((s) => ({ chat: [...s.chat, m] })),
  setChat: (m) => set({ chat: m }),
  clearChat: () => set({ chat: [] }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  commandOpen: false,
  setCommandOpen: (b) => set({ commandOpen: b }),

  pendingRepoUrl: null,
  setPendingRepoUrl: (url) => set({ pendingRepoUrl: url }),
  consumePendingRepoUrl: () => {
    const url = useAppStore.getState().pendingRepoUrl;
    if (url) set({ pendingRepoUrl: null });
    return url;
  },
}));
