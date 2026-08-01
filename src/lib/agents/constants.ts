// CodeInsight AI — Agent count constant
//
// Single source of truth for the number of specialized AI agents.
// UI components import THIS file (not @/lib/agents) to avoid pulling
// Node.js-only dependencies (child_process, fs, etc.) into client bundles.
//
// When adding/removing an agent file in src/lib/agents/, update this number
// AND add/remove the export in src/lib/agents/index.ts.

export const AGENT_COUNT = 9;
