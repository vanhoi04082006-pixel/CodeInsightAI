"use client";

import { GlassCard } from "@/components/shared/ui";
import { Brain, FileCode, Bug, Target, Lightbulb } from "lucide-react";

interface WorkingMemoryPanelProps {
  memory: {
    currentHypothesis?: string | null;
    currentFile?: string | null;
    currentFunction?: string | null;
    currentSymbol?: string | null;
    currentBug?: any;
    currentStep?: string | null;
    scratchpad?: string[];
  };
}

export function WorkingMemoryPanel({ memory }: WorkingMemoryPanelProps) {
  const hasContent = memory.currentFile || memory.currentStep || memory.currentHypothesis || (memory.scratchpad && memory.scratchpad.length > 0);

  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Brain className="h-3.5 w-3.5 text-violet-300" /> Working Memory
      </h3>

      {!hasContent ? (
        <p className="py-4 text-center text-xs text-muted-foreground/50">
          Agent memory is empty. Start a task to see real-time focus.
        </p>
      ) : (
        <div className="space-y-2 text-xs">
          {memory.currentFile && (
            <MemoryItem icon={FileCode} label="File" value={memory.currentFile} color="text-cyan-300" />
          )}
          {memory.currentFunction && (
            <MemoryItem icon={FileCode} label="Function" value={memory.currentFunction} color="text-cyan-300" />
          )}
          {memory.currentStep && (
            <MemoryItem icon={Target} label="Step" value={memory.currentStep} color="text-violet-300" />
          )}
          {memory.currentHypothesis && (
            <MemoryItem icon={Lightbulb} label="Hypothesis" value={memory.currentHypothesis} color="text-amber-300" />
          )}
          {memory.currentBug && (
            <MemoryItem icon={Bug} label="Bug" value={memory.currentBug.title || String(memory.currentBug)} color="text-rose-300" />
          )}

          {memory.scratchpad && memory.scratchpad.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground/60">Scratchpad</p>
              <div className="max-h-32 space-y-1 overflow-y-auto scrollbar-thin">
                {memory.scratchpad.slice(-5).map((note, i) => (
                  <div key={i} className="rounded-md border border-white/5 bg-white/[0.02] px-2 py-1 text-[10px] text-foreground/60">
                    {note.replace(/^\[.*?\]\s*/, "")}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function MemoryItem({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof FileCode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-3 w-3 shrink-0 ${color}`} />
      <span className="text-muted-foreground/60">{label}:</span>
      <span className={`truncate font-medium ${color}`}>{value}</span>
    </div>
  );
}
