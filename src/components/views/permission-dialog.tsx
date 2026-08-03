"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/shared/ui";

export interface PendingPermission {
  nodeId: string;
  tool: string;
  params: Record<string, unknown>;
  diff?: string;
}

interface PermissionDialogProps {
  permission: PendingPermission | null;
  onRespond: (granted: boolean) => void;
}

export function PermissionDialog({ permission, onRespond }: PermissionDialogProps) {
  return (
    <AnimatePresence>
      {permission && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => onRespond(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg"
          >
            <GlassCard strong className="border-amber-400/30 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15">
                  <ShieldAlert className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Permission Required</h3>
                  <p className="text-xs text-muted-foreground">
                    The agent wants to execute: <code className="text-amber-300">{permission.tool}</code>
                  </p>
                </div>
              </div>

              {/* Diff preview */}
              {typeof permission.diff === "string" && permission.diff.length > 0 && (
                <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-white/5 bg-black/20 p-3 scrollbar-thin">
                  <pre className="text-[11px] leading-relaxed text-foreground/70 whitespace-pre-wrap">
                    {permission.diff.slice(0, 3000)}
                    {permission.diff.length > 3000 ? "\n... [truncated]" : ""}
                  </pre>
                </div>
              )}

              {/* Params */}
              {!permission.diff && permission.params && (
                <div className="mt-4 max-h-32 overflow-auto rounded-lg border border-white/5 bg-black/20 p-3 scrollbar-thin">
                  <pre className="text-[11px] leading-relaxed text-foreground/70">
                    {JSON.stringify(permission.params, null, 2).slice(0, 1000)}
                  </pre>
                </div>
              )}

              {/* Actions */}
              <div className="mt-5 flex gap-2">
                <Button
                  onClick={() => onRespond(true)}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:opacity-90"
                >
                  <Check className="mr-1.5 h-4 w-4" /> Approve
                </Button>
                <Button
                  onClick={() => onRespond(false)}
                  variant="outline"
                  className="flex-1 border-rose-400/30 text-rose-300 hover:bg-rose-500/10"
                >
                  <X className="mr-1.5 h-4 w-4" /> Reject
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
