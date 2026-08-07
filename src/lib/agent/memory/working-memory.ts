// CodeInsight AI — Working Memory (Layer 7, Memory Layer 1)
// Volatile, per-step focus. Updated continuously as the Agent works.
// Cleared between unrelated tasks.

import type { WorkingMemory as IWorkingMemory, PendingChoice, SemanticIssue } from "../contracts";

export class WorkingMemoryImpl implements IWorkingMemory {
  currentHypothesis: string | null = null;
  currentFile: string | null = null;
  currentFunction: string | null = null;
  currentSymbol: string | null = null;
  currentBug: SemanticIssue | null = null;
  currentStep: string | null = null;
  scratchpad: string[] = [];
  pendingChoices: PendingChoice[] = [];

  update(patch: Partial<IWorkingMemory>): void {
    if (patch.currentHypothesis !== undefined) this.currentHypothesis = patch.currentHypothesis;
    if (patch.currentFile !== undefined) this.currentFile = patch.currentFile;
    if (patch.currentFunction !== undefined) this.currentFunction = patch.currentFunction;
    if (patch.currentSymbol !== undefined) this.currentSymbol = patch.currentSymbol;
    if (patch.currentBug !== undefined) this.currentBug = patch.currentBug;
    if (patch.currentStep !== undefined) this.currentStep = patch.currentStep;
    if (patch.scratchpad !== undefined) this.scratchpad = patch.scratchpad;
    if (patch.pendingChoices !== undefined) this.pendingChoices = patch.pendingChoices;
  }

  pushScratch(note: string): void {
    // Audit fix F7: Cap scratchpad at 100 entries (FIFO)
    const entry = `[${new Date().toISOString()}] ${note}`;
    this.scratchpad.push(entry);
    if (this.scratchpad.length > 100) {
      this.scratchpad = this.scratchpad.slice(-100); // keep last 100
    }
  }

  clear(): void {
    this.currentHypothesis = null;
    this.currentFile = null;
    this.currentFunction = null;
    this.currentSymbol = null;
    this.currentBug = null;
    this.currentStep = null;
    this.scratchpad = [];
    this.pendingChoices = [];
  }

  /** Add a pending choice for the user to decide */
  addChoice(choice: PendingChoice): void {
    this.pendingChoices.push(choice);
  }

  /** Resolve a pending choice */
  resolveChoice(id: string, selected: string): void {
    const choice = this.pendingChoices.find((c) => c.id === id);
    if (choice) {
      choice.selected = selected;
    }
  }

  /** Get snapshot of current state (for checkpoint) */
  snapshot(): IWorkingMemory {
    return {
      currentHypothesis: this.currentHypothesis,
      currentFile: this.currentFile,
      currentFunction: this.currentFunction,
      currentSymbol: this.currentSymbol,
      currentBug: this.currentBug,
      currentStep: this.currentStep,
      scratchpad: [...this.scratchpad],
      pendingChoices: [...this.pendingChoices],
      update: () => {},
      pushScratch: () => {},
      clear: () => {},
    };
  }
}
