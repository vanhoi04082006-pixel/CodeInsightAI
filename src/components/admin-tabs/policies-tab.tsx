"use client";

// P3.5 — Admin Policies Tab.
//
// Lists all 8 fixed-catalog policy types. For each:
//   - Toggle enable/disable.
//   - Edit config fields (rendered from the catalog's `configSchema`).
//   - Save → POST /api/admin/policies { type, enabled, config }.
//   - Reset → DELETE /api/admin/policies?type=... (removes the row; the
//     catalog entry remains so the admin can re-configure later).
//
// Catalog is fetched from the API (which returns the merged set: DB rows +
// unconfigured catalog entries pre-filled with default config). The UI
// doesn't need to know the catalog ahead of time — it just renders
// whatever the API returns.

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Check,
  Loader2,
  Trash2,
  Save,
  AlertTriangle,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LoadingCard } from "@/components/views/admin-view";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

// ── Types (mirror of src/lib/policies/types.ts POLICY_CATALOG entry) ──
interface ConfigField {
  type: "number" | "string" | "boolean";
  label: string;
  default: any;
}
interface PolicyEntry {
  id: string | null;
  type: string;
  enabled: boolean;
  config: Record<string, any>;
  createdAt: string | null;
  updatedAt: string | null;
  label: string;
  description: string;
  configSchema: Record<string, ConfigField>;
  configured: boolean;
}

// Which checkpoint each policy type is evaluated at — for the badge.
// Mirrors the evaluator logic in src/lib/policies/evaluator.ts.
const CHECKPOINT_BY_TYPE: Record<string, "analyze" | "ai-pass" | "both"> = {
  "max-files": "analyze",
  "max-file-size": "analyze",
  "block-provider": "ai-pass",
  "block-language": "analyze",
  "require-auth": "both",
  "block-private-repos": "analyze",
  "max-tokens-per-call": "ai-pass",
  "allowed-models-only": "ai-pass",
};

const SEVERITY_BY_TYPE: Record<string, "block" | "warn"> = {
  "max-files": "block",
  "max-file-size": "block",
  "block-provider": "block",
  "block-language": "block",
  "require-auth": "block",
  "block-private-repos": "block",
  "max-tokens-per-call": "warn",
  "allowed-models-only": "block",
};

export function PoliciesTab() {
  const { t } = useT();
  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Track which policy type is currently being saved (for button spinner).
  const [savingType, setSavingType] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/policies");
      const data = await res.json();
      setPolicies(data.policies || []);
    } catch {
      toast.error(t("admin", "policies.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Update a single field in a policy's config (local state only —
  // doesn't persist until Save is clicked).
  const updateConfigField = (
    policyType: string,
    fieldKey: string,
    value: any,
  ) => {
    setPolicies((prev) =>
      prev.map((p) =>
        p.type === policyType
          ? { ...p, config: { ...p.config, [fieldKey]: value } }
          : p,
      ),
    );
  };

  const toggleEnabled = (policyType: string, enabled: boolean) => {
    setPolicies((prev) =>
      prev.map((p) => (p.type === policyType ? { ...p, enabled } : p)),
    );
  };

  const handleSave = async (policy: PolicyEntry) => {
    setSavingType(policy.type);
    try {
      const res = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: policy.type,
          enabled: policy.enabled,
          config: policy.config,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t("admin", "policies.saved"));
        load();
      } else {
        toast.error(data.error || t("admin", "policies.saveFailed"));
      }
    } catch {
      toast.error(t("admin", "policies.saveFailed"));
    } finally {
      setSavingType(null);
    }
  };

  const handleReset = async (policyType: string) => {
    if (!confirm(t("admin", "policies.deleteConfirm"))) return;
    try {
      const res = await fetch(
        `/api/admin/policies?type=${encodeURIComponent(policyType)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.success) {
        toast.success(t("admin", "policies.deleted"));
        load();
      } else {
        toast.error(data.error || t("admin", "policies.deleteFailed"));
      }
    } catch {
      toast.error(t("admin", "policies.deleteFailed"));
    }
  };

  if (loading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      <GlassCard className="p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-semibold">
            <GradientText>{t("admin", "policies.title")}</GradientText>
          </h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("admin", "policies.description")}
        </p>

        {policies.length === 0 ? (
          <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-4 text-center">
            <p className="text-sm text-rose-300">
              {t("admin", "policies.noPolicies")}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {policies.map((p) => {
              const checkpoint = CHECKPOINT_BY_TYPE[p.type] ?? "both";
              const severity = SEVERITY_BY_TYPE[p.type] ?? "block";
              const checkpointLabel =
                checkpoint === "analyze"
                  ? t("admin", "policies.checkpointAnalyze")
                  : checkpoint === "ai-pass"
                    ? t("admin", "policies.checkpointAiPass")
                    : t("admin", "policies.checkpointBoth");
              const isSaving = savingType === p.type;
              return (
                <div
                  key={p.type}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-4"
                >
                  {/* Header row: label + badges + toggle */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{p.label}</p>
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] text-muted-foreground"
                        >
                          {p.type}
                        </Badge>
                        <Badge
                          className={
                            p.configured && p.enabled
                              ? "bg-emerald-500/15 text-emerald-300"
                              : p.configured
                                ? "bg-amber-500/15 text-amber-300"
                                : "bg-white/5 text-muted-foreground"
                          }
                        >
                          {p.configured
                            ? p.enabled
                              ? t("admin", "policies.enabled")
                              : t("admin", "policies.disabled")
                            : t("admin", "policies.notConfigured")}
                        </Badge>
                        <Badge
                          className={
                            severity === "block"
                              ? "bg-rose-500/15 text-rose-300"
                              : "bg-amber-500/15 text-amber-300"
                          }
                          title={
                            severity === "block"
                              ? "Returns 403"
                              : "Logs + continues (may cap a parameter)"
                          }
                        >
                          {severity === "block"
                            ? t("admin", "policies.blockSeverity")
                            : t("admin", "policies.warnSeverity")}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] text-muted-foreground"
                        >
                          {checkpointLabel}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.description}
                      </p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => toggleEnabled(p.type, e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-white/[0.03]"
                      />
                      {p.enabled
                        ? t("admin", "policies.enabled")
                        : t("admin", "policies.disabled")}
                    </label>
                  </div>

                  {/* Config fields */}
                  <div className="mt-3">
                    {Object.keys(p.configSchema).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {t("admin", "policies.noConfig")}
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {Object.entries(p.configSchema).map(
                          ([fieldKey, field]) => (
                            <div key={fieldKey} className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                {field.label}
                              </label>
                              {field.type === "boolean" ? (
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(p.config[fieldKey])}
                                    onChange={(e) =>
                                      updateConfigField(
                                        p.type,
                                        fieldKey,
                                        e.target.checked,
                                      )
                                    }
                                    className="h-4 w-4 rounded border-white/20 bg-white/[0.03]"
                                  />
                                  <span>{field.label}</span>
                                </label>
                              ) : (
                                <Input
                                  type={
                                    field.type === "number" ? "number" : "text"
                                  }
                                  value={String(p.config[fieldKey] ?? "")}
                                  onChange={(e) =>
                                    updateConfigField(
                                      p.type,
                                      fieldKey,
                                      field.type === "number"
                                        ? Number(e.target.value)
                                        : e.target.value,
                                    )
                                  }
                                  className="bg-white/[0.03] font-mono text-xs"
                                />
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer: Save + Reset */}
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSave(p)}
                      disabled={isSaving}
                      className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                    >
                      {isSaving ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {isSaving
                        ? t("admin", "policies.saving")
                        : t("admin", "policies.save")}
                    </Button>
                    {p.configured && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-300"
                        onClick={() => handleReset(p.type)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {t("admin", "policies.delete")}
                      </Button>
                    )}
                    {p.configured && p.updatedAt && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Helper card: explains severity semantics */}
      <GlassCard className="p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("admin", "policies.blockSeverity")} → 403 ·{" "}
              <span className="font-medium text-foreground">
                {t("admin", "policies.warnSeverity")}
              </span>{" "}
              → log + continue
            </p>
            <p className="mt-1">
              Block-severity policies return HTTP 403 with the violation
              details. Warn-severity policies (currently only
              <span className="font-mono"> max-tokens-per-call</span>) cap the
              relevant parameter and let the request continue. Policy cache
              TTL: 60s — changes take effect on the next request after Save.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
