"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MissionStatus =
  | "idle"
  | "planning"
  | "executing"
  | "verifying"
  | "completed"
  | "failed";

export type MissionPhase =
  | "observe"
  | "think"
  | "act"
  | "verify"
  | "reflect"
  | "decide";

export type MissionEventType =
  | "agent:thinking"
  | "agent:acting"
  | "agent:status"
  | "agent:result"
  | "tool:call"
  | "tool:result"
  | "decision"
  | "file:change"
  | "terminal:output"
  | "confidence:update"
  | "error"
  | "phase:change"
  | "iteration:start"
  | "mission:start"
  | "mission:end";

export interface MissionEvent {
  id: string;
  type: MissionEventType;
  agent?: string;
  message?: string;
  action?: string;
  detail?: string;
  tool?: string;
  args?: string;
  success?: boolean;
  durationMs?: number;
  confidence?: number;
  reasoning?: string;
  path?: string;
  fileAction?: string;
  additions?: number;
  deletions?: number;
  stream?: string;
  data?: string;
  phase?: MissionPhase;
  iteration?: number;
  summary?: string;
  timestamp: number;
}

export interface AgentStatus {
  status: "idle" | "thinking" | "acting" | "waiting" | "done" | "error";
  detail?: string;
  lastUpdate: number;
}

export interface FileModified {
  path: string;
  action: string;
  additions: number;
  deletions: number;
}

export interface TerminalLine {
  stream: "stdout" | "stderr" | "system";
  data: string;
  timestamp: number;
}

export interface ExecutiveDecision {
  reasoning: string;
  action: string;
  confidence: number;
  timestamp: number;
}

export interface MissionMemoryItem {
  key: string;
  value: string;
  timestamp: number;
}

/** Minimal provider config snapshot persisted for replay. */
export interface AIProviderConfig {
  providerId: string;
  label: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

export interface MissionTemplate {
  id: string;
  title: string;
  goal: string;
  icon: string;
  accent: string;
}

export interface MissionHistoryItem {
  missionId: string;
  goal: string;
  repoUrl: string;
  status: MissionStatus;
  startedAt: number;
  endedAt?: number;
  iteration: number;
  filesModified: number;
}

const MAX_EVENTS = 100;
const MAX_TERMINAL = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

function newId(): string {
  return `evt_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: "tpl-add-auth",
    title: "Add Authentication",
    goal: "Add Google OAuth login with JWT session handling",
    icon: "shield",
    accent: "#34d399",
  },
  {
    id: "tpl-fix-bugs",
    title: "Fix Critical Bugs",
    goal: "Find and fix all critical and high-severity bugs in the codebase",
    icon: "bug",
    accent: "#f472b6",
  },
  {
    id: "tpl-add-tests",
    title: "Increase Test Coverage",
    goal: "Add unit tests for all untested utility functions, target 80% coverage",
    icon: "flask",
    accent: "#22d3ee",
  },
  {
    id: "tpl-refactor",
    title: "Refactor Architecture",
    goal: "Refactor the codebase into clean layered architecture (domain/app/infra)",
    icon: "layers",
    accent: "#a78bfa",
  },
  {
    id: "tpl-perf",
    title: "Optimize Performance",
    goal: "Identify and fix top 5 performance bottlenecks; reduce bundle size 20%",
    icon: "gauge",
    accent: "#fbbf24",
  },
  {
    id: "tpl-docs",
    title: "Generate Documentation",
    goal: "Generate complete README, API docs, and architecture guide",
    icon: "book",
    accent: "#34d399",
  },
];

// ── Store interface ──────────────────────────────────────────────────────────

interface MissionStore {
  // Mission input (persisted)
  goal: string;
  repoUrl: string;
  provider: AIProviderConfig | null;
  maxIterations: number;

  // Mission runtime state (NOT persisted)
  missionId: string | null;
  status: MissionStatus;
  currentPhase: MissionPhase;
  iteration: number;
  confidence: number;

  // Activity feed (capped)
  events: MissionEvent[];

  // Agent statuses
  agentStatuses: Record<string, AgentStatus>;

  // World state
  currentTask: string;
  currentFile: string;
  filesModified: FileModified[];
  buildStatus: "pass" | "fail" | "pending";
  testStatus: "pass" | "fail" | "pending";
  terminalOutput: TerminalLine[];
  decisions: ExecutiveDecision[];
  memory: MissionMemoryItem[];

  // Connection state
  connected: boolean;
  demoMode: boolean;

  // History (persisted)
  history: MissionHistoryItem[];

  // Actions — input
  setGoal: (g: string) => void;
  setRepoUrl: (u: string) => void;
  setProvider: (p: AIProviderConfig | null) => void;
  setMaxIterations: (n: number) => void;

  // Actions — lifecycle
  startMission: () => Promise<void>;
  cancelMission: () => void;
  reset: () => void;

  // SSE
  subscribeToMission: (missionId: string) => void;
  unsubscribe: () => void;
  _eventSource: EventSource | null;

  // Event processing
  handleEvent: (event: MissionEvent) => void;

  // Demo mode (for development visibility)
  startDemoMode: () => void;
}

// ── Demo event generator ──────────────────────────────────────────────────────

const DEMO_AGENTS = [
  "Executive",
  "Planner",
  "Repository Analyst",
  "Code Reviewer",
  "Bug Fixer",
  "Refactoring",
  "Documentation",
  "Test",
  "Security",
  "Performance",
  "DevOps",
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeDemoEvent(): MissionEvent {
  const types: MissionEventType[] = [
    "agent:thinking",
    "agent:acting",
    "agent:status",
    "tool:call",
    "tool:result",
    "file:change",
    "confidence:update",
  ];
  const type = randomFrom(types);
  const agent = randomFrom(DEMO_AGENTS);
  const ts = Date.now();
  const base = { id: newId(), type, agent, timestamp: ts };

  switch (type) {
    case "agent:thinking":
      return {
        ...base,
        message: randomFrom([
          "Analyzing dependency graph for circular imports",
          "Reviewing test coverage gaps in src/lib/",
          "Evaluating refactoring strategy for legacy modules",
          "Considering security implications of new auth flow",
          "Mapping data flow between services",
        ]),
      };
    case "agent:acting":
      return {
        ...base,
        action: randomFrom(["Editing", "Running", "Generating", "Validating"]),
        detail: randomFrom([
          "src/components/auth/login.tsx",
          "bun run lint",
          "test suite for user module",
          "schema.prisma migration",
        ]),
      };
    case "agent:status":
      return {
        ...base,
        detail: randomFrom([
          "Idle — waiting for planner",
          "Analyzing — 3 files in queue",
          "Completed — 2 fixes applied",
        ]),
      };
    case "tool:call":
      return {
        ...base,
        tool: randomFrom(["readFile", "writeFile", "runCommand", "searchCode"]),
        args: randomFrom(["src/app/page.tsx", "bun test", "useEffect", "package.json"]),
      };
    case "tool:result":
      return {
        ...base,
        success: Math.random() > 0.2,
        durationMs: Math.floor(Math.random() * 800) + 50,
      };
    case "file:change":
      return {
        ...base,
        path: randomFrom([
          "src/components/auth/login.tsx",
          "src/lib/store.ts",
          "src/app/api/auth/route.ts",
          "package.json",
          "prisma/schema.prisma",
        ]),
        fileAction: randomFrom(["modified", "added", "deleted"]),
        additions: Math.floor(Math.random() * 80) + 5,
        deletions: Math.floor(Math.random() * 30),
      };
    case "confidence:update":
      return {
        ...base,
        confidence: Math.floor(Math.random() * 40) + 55,
      };
    default:
      return base as MissionEvent;
  }
}

// ── Store implementation ─────────────────────────────────────────────────────

export const useMissionStore = create<MissionStore>()(
  persist(
    (set, get) => {
      let demoTimer: ReturnType<typeof setInterval> | null = null;

      return {
        // Input
        goal: "",
        repoUrl: "",
        provider: null,
        maxIterations: 10,

        // Runtime
        missionId: null,
        status: "idle",
        currentPhase: "observe",
        iteration: 0,
        confidence: 0,

        events: [],
        agentStatuses: {},
        currentTask: "",
        currentFile: "",
        filesModified: [],
        buildStatus: "pending",
        testStatus: "pending",
        terminalOutput: [],
        decisions: [],
        memory: [],

        connected: false,
        demoMode: false,

        history: [],

        // _eventSource not initialized until subscribeToMission called
        _eventSource: null,

        // Input setters
        setGoal: (g) => set({ goal: g }),
        setRepoUrl: (u) => set({ repoUrl: u }),
        setProvider: (p) => set({ provider: p }),
        setMaxIterations: (n) => set({ maxIterations: n }),

        // Lifecycle
        startMission: async () => {
          const { goal, repoUrl, provider } = get();
          if (!goal.trim()) {
            return;
          }
          // Try to call the real API; fall back to demo mode on failure.
          const missionId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          set({
            missionId,
            status: "planning",
            currentPhase: "observe",
            iteration: 1,
            confidence: 30,
            events: [],
            agentStatuses: {},
            filesModified: [],
            terminalOutput: [],
            decisions: [],
            memory: [],
            buildStatus: "pending",
            testStatus: "pending",
            currentTask: "Initializing mission",
            currentFile: "",
            connected: false,
            demoMode: false,
          });

          // Emit local start events immediately for snappy UI
          get().handleEvent({
            id: newId(),
            type: "mission:start",
            timestamp: Date.now(),
            message: `Mission started: ${goal.slice(0, 80)}`,
          });

          try {
            const res = await fetch("/api/mission/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                missionId,
                goal,
                repoUrl,
                provider,
                maxIterations: get().maxIterations,
              }),
            });
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
            const data = (await res.json()) as { missionId?: string };
            const realId = data.missionId ?? missionId;
            set({ missionId: realId });
            get().subscribeToMission(realId);
          } catch {
            // API not available — drop into demo mode so UI is still useful.
            get().startDemoMode();
          }
        },

        cancelMission: () => {
          get().unsubscribe();
          if (demoTimer) {
            clearInterval(demoTimer);
            demoTimer = null;
          }
          const { missionId, goal, repoUrl, iteration, filesModified, status } = get();
          if (missionId) {
            const finalStatus: MissionStatus = status === "completed" ? "completed" : "failed";
            set((s) => ({
              history: [
                {
                  missionId,
                  goal,
                  repoUrl,
                  status: finalStatus,
                  startedAt: Date.now() - 60000,
                  endedAt: Date.now(),
                  iteration,
                  filesModified: filesModified.length,
                },
                ...s.history,
              ].slice(0, 20),
            }));
          }
          set({
            missionId: null,
            status: "idle",
            currentPhase: "observe",
            iteration: 0,
            confidence: 0,
            connected: false,
            demoMode: false,
          });
        },

        reset: () => {
          get().unsubscribe();
          if (demoTimer) {
            clearInterval(demoTimer);
            demoTimer = null;
          }
          set({
            missionId: null,
            status: "idle",
            currentPhase: "observe",
            iteration: 0,
            confidence: 0,
            events: [],
            agentStatuses: {},
            currentTask: "",
            currentFile: "",
            filesModified: [],
            buildStatus: "pending",
            testStatus: "pending",
            terminalOutput: [],
            decisions: [],
            memory: [],
            connected: false,
            demoMode: false,
          });
        },

        // SSE
        subscribeToMission: (missionId) => {
          // Tear down any existing connection.
          get().unsubscribe();

          let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
          try {
            const es = new EventSource(
              `/api/mission/stream?missionId=${encodeURIComponent(missionId)}`
            );
            es.onopen = () => set({ connected: true, demoMode: false });
            es.onmessage = (msg) => {
              try {
                const evt = JSON.parse(msg.data) as MissionEvent;
                if (!evt.id) evt.id = newId();
                if (!evt.timestamp) evt.timestamp = Date.now();
                get().handleEvent(evt);
              } catch {
                /* ignore malformed payloads */
              }
            };
            es.onerror = () => {
              set({ connected: false });
              es.close();
              // Reconnect after 3 seconds if mission is still running.
              const { status } = get();
              if (status === "planning" || status === "executing" || status === "verifying") {
                reconnectTimer = setTimeout(() => {
                  if (get().missionId === missionId) {
                    get().subscribeToMission(missionId);
                  }
                }, 3000);
              }
            };
            set({ _eventSource: es });
          } catch {
            // EventSource not available — start demo mode.
            get().startDemoMode();
          }
          // Cleanup captured in unsubscribe by clearing _eventSource.
          void reconnectTimer;
        },

        unsubscribe: () => {
          const es = get()._eventSource;
          if (es) {
            es.close();
            set({ _eventSource: null });
          }
          if (demoTimer) {
            clearInterval(demoTimer);
            demoTimer = null;
          }
          set({ connected: false });
        },

        // Event processing
        handleEvent: (event) => {
          set((s) => {
            const events = [...s.events, event].slice(-MAX_EVENTS);

            // Side-effect state updates based on event type
            const patch: Partial<MissionStore> = { events };

            switch (event.type) {
              case "agent:status": {
                if (event.agent) {
                  const detail = event.detail?.toLowerCase() ?? "";
                  const inferredStatus: AgentStatus["status"] = detail.includes("idle")
                    ? "idle"
                    : detail.includes("analyzing") || detail.includes("thinking")
                    ? "thinking"
                    : detail.includes("completed")
                    ? "done"
                    : "acting";
                  const agentStatuses = { ...s.agentStatuses };
                  agentStatuses[event.agent] = {
                    status: inferredStatus,
                    detail: event.detail,
                    lastUpdate: event.timestamp,
                  };
                  patch.agentStatuses = agentStatuses;
                }
                break;
              }
              case "agent:thinking": {
                if (event.agent) {
                  const agentStatuses = { ...s.agentStatuses };
                  agentStatuses[event.agent] = {
                    status: "thinking",
                    detail: event.message,
                    lastUpdate: event.timestamp,
                  };
                  patch.agentStatuses = agentStatuses;
                }
                if (event.message) {
                  patch.currentTask = event.message;
                }
                break;
              }
              case "agent:acting": {
                if (event.agent) {
                  const agentStatuses = { ...s.agentStatuses };
                  agentStatuses[event.agent] = {
                    status: "acting",
                    detail: event.detail ? `${event.action} ${event.detail}` : event.action,
                    lastUpdate: event.timestamp,
                  };
                  patch.agentStatuses = agentStatuses;
                }
                if (event.detail) {
                  patch.currentFile = event.detail;
                }
                break;
              }
              case "agent:result": {
                if (event.agent) {
                  const agentStatuses = { ...s.agentStatuses };
                  agentStatuses[event.agent] = {
                    status: event.success === false ? "error" : "done",
                    detail: event.summary,
                    lastUpdate: event.timestamp,
                  };
                  patch.agentStatuses = agentStatuses;
                }
                break;
              }
              case "file:change": {
                if (event.path) {
                  const existing = s.filesModified.filter(
                    (f) => f.path !== event.path
                  );
                  patch.filesModified = [
                    {
                      path: event.path,
                      action: event.fileAction ?? "modified",
                      additions: event.additions ?? 0,
                      deletions: event.deletions ?? 0,
                    },
                    ...existing,
                  ];
                  patch.currentFile = event.path;
                }
                break;
              }
              case "terminal:output": {
                const line: TerminalLine = {
                  stream: (event.stream as TerminalLine["stream"]) ?? "stdout",
                  data: event.data ?? "",
                  timestamp: event.timestamp,
                };
                patch.terminalOutput = [...s.terminalOutput, line].slice(-MAX_TERMINAL);
                break;
              }
              case "confidence:update": {
                if (typeof event.confidence === "number") {
                  patch.confidence = Math.max(0, Math.min(100, event.confidence));
                }
                break;
              }
              case "decision": {
                if (event.action) {
                  patch.decisions = [
                    {
                      reasoning: event.reasoning ?? "",
                      action: event.action,
                      confidence: event.confidence ?? 0,
                      timestamp: event.timestamp,
                    },
                    ...s.decisions,
                  ].slice(0, 20);
                }
                break;
              }
              case "phase:change": {
                if (event.phase) {
                  patch.currentPhase = event.phase;
                }
                break;
              }
              case "iteration:start": {
                if (typeof event.iteration === "number") {
                  patch.iteration = event.iteration;
                }
                break;
              }
              case "error": {
                patch.buildStatus = "fail";
                break;
              }
              case "mission:end": {
                patch.status = event.success === false ? "failed" : "completed";
                break;
              }
              default:
                break;
            }

            return patch;
          });
        },

        // Demo mode
        startDemoMode: () => {
          set({ demoMode: true, status: "executing", connected: false });
          if (demoTimer) clearInterval(demoTimer);
          let iter = 1;
          let conf = 30;

          // Initial seed events
          get().handleEvent({
            id: newId(),
            type: "mission:start",
            timestamp: Date.now(),
            message: "Demo mode: simulating mission events (no API connected)",
          });

          demoTimer = setInterval(() => {
            const evt = makeDemoEvent();
            evt.timestamp = Date.now();
            get().handleEvent(evt);

            // Occasionally bump iteration + confidence
            if (Math.random() < 0.08) {
              iter += 1;
              conf = Math.min(95, conf + Math.floor(Math.random() * 10));
              get().handleEvent({
                id: newId(),
                type: "iteration:start",
                timestamp: Date.now(),
                iteration: iter,
              });
              get().handleEvent({
                id: newId(),
                type: "confidence:update",
                timestamp: Date.now(),
                confidence: conf,
              });
            }

            // Occasionally emit a decision
            if (Math.random() < 0.05) {
              get().handleEvent({
                id: newId(),
                type: "decision",
                timestamp: Date.now(),
                agent: "Executive",
                reasoning: "Tests pass and code review score is 8/10 — proceeding to next sub-goal.",
                action: "Continue iteration",
                confidence: conf,
              });
            }

            // Stop demo after ~30s
            if (iter >= 8) {
              if (demoTimer) {
                clearInterval(demoTimer);
                demoTimer = null;
              }
              get().handleEvent({
                id: newId(),
                type: "mission:end",
                timestamp: Date.now(),
                success: true,
                message: "Demo mission complete — connect an API for real runs.",
              });
              set({ status: "completed" });
            }
          }, 900);
        },
      };
    },
    {
      name: "codeinsight-mission-store",
      // Only persist input fields + history, NOT runtime events
      partialize: (s) => ({
        goal: s.goal,
        repoUrl: s.repoUrl,
        provider: s.provider,
        maxIterations: s.maxIterations,
        history: s.history,
      }),
    }
  )
);
