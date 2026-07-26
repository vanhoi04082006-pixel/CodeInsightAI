"use client";

import { useEffect, useState } from "react";
import {
  Cpu, Settings2, Check, Zap, Loader2, AlertCircle, CheckCircle2, Trash2,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingCard } from "@/components/views/admin-view";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function PlatformAITab() {
  const { t } = useT();
  const [configured, setConfigured] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state for adding/editing
  const [editProviderId, setEditProviderId] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editModels, setEditModels] = useState<string[]>([]);
  const [editEnabled, setEditEnabled] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: "ok" | "error" | "testing"; latency?: number; error?: string }>>({});
  const [testModelSelection, setTestModelSelection] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/platform-ai");
      const data = await res.json();
      setConfigured(data.configured || []);
      setAvailable(data.available || []);
    } catch {
      toast.error(t("admin", "platformAi.toast.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = (providerId: string) => {
    const p = available.find((x) => x.providerId === providerId);
    if (!p) return;
    setEditProviderId(p.providerId);
    setEditApiKey("");
    setEditBaseUrl(p.defaultBaseUrl);
    setEditModels(p.models);
    setEditEnabled(true);
    setShowAddForm(true);
  };

  // Set provider as default (first in list = default for Pro users)
  const handleSetDefault = async (providerId: string) => {
    try {
      // Reorder: move this provider to first position
      const res = await fetch("/api/admin/platform-ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-default", providerId }),
      });
      if (res.ok) {
        toast.success(t("admin", "platformAi.toast.setDefaultSuccess", { providerId }));
        load();
      } else {
        toast.error(t("admin", "platformAi.toast.setDefaultFailed"));
      }
    } catch {
      toast.error(t("admin", "platformAi.toast.setDefaultFailed"));
    }
  };

  const handleEdit = (c: any) => {
    setEditProviderId(c.providerId);
    setEditApiKey("");
    setEditBaseUrl(c.baseUrl);
    setEditModels(c.models);
    setEditEnabled(c.enabled);
    setShowAddForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/platform-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: editProviderId,
          apiKey: editApiKey || undefined,
          baseUrl: editBaseUrl,
          models: editModels,
          enabled: editEnabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t("admin", "platformAi.toast.saved", { providerId: editProviderId }));
        setShowAddForm(false);
        setEditApiKey("");
        load();
      } else {
        toast.error(data.error || t("admin", "platformAi.toast.saveFailed"));
      }
    } catch {
      toast.error(t("admin", "platformAi.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (providerId: string) => {
    if (!confirm(t("admin", "platformAi.confirmRemove", { providerId }))) return;
    try {
      await fetch(`/api/admin/platform-ai?providerId=${providerId}`, { method: "DELETE" });
      toast.success(t("admin", "platformAi.toast.removed", { providerId }));
      load();
    } catch {
      toast.error(t("admin", "platformAi.toast.removeFailed"));
    }
  };

  // Test API key connectivity — admin endpoint decrypts key server-side
  // model param: specific model to test (from dropdown selection)
  const handleTestKey = async (providerId: string, apiKey?: string, baseUrl?: string, model?: string) => {
    setTesting(providerId);
    setTestResults((prev) => ({ ...prev, [providerId]: { status: "testing" } }));
    try {
      // Always use admin test endpoint (server decrypts key)
      const testRes = await fetch("/api/admin/platform-ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, model }),
      });
      const testData = await testRes.json();
      setTestResults((prev) => ({
        ...prev,
        [providerId]: testData.status === "connected"
          ? { status: "ok", latency: testData.latencyMs }
          : { status: "error", error: testData.error },
      }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { status: "error", error: t("admin", "platformAi.networkError") },
      }));
    } finally {
      setTesting(null);
    }
  };

  if (loading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      <GlassCard className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-semibold"><GradientText>{t("admin", "platformAi.providersTitle")}</GradientText></h3>
          </div>
          <Badge variant="outline" className="text-[10px]">{t("admin", "platformAi.configuredCount", { count: configured.length })}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("admin", "platformAi.description")}
        </p>

        {/* Configured providers list */}
        {configured.length === 0 ? (
          <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-4 text-center">
            <p className="text-sm text-rose-300">{t("admin", "platformAi.noProviders")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("admin", "platformAi.noProvidersDesc")}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {configured.map((c) => {
              const testResult = testResults[c.providerId];
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{c.name}</p>
                      <Badge className={c.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}>
                        {c.enabled ? t("admin", "platformAi.enabled") : t("admin", "platformAi.disabled")}
                      </Badge>
                      {/* Test status badge */}
                      {testResult?.status === "ok" && (
                        <Badge className="bg-emerald-500/15 text-emerald-300">
                          <CheckCircle2 className="mr-1 h-2.5 w-2.5" /> {testResult.latency}ms
                        </Badge>
                      )}
                      {testResult?.status === "error" && (
                        <Badge className="bg-rose-500/15 text-rose-300">
                          <AlertCircle className="mr-1 h-2.5 w-2.5" /> {t("admin", "platformAi.errorBadge")}
                        </Badge>
                      )}
                      {testResult?.status === "testing" && (
                        <Badge className="bg-amber-500/15 text-amber-300">
                          <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> {t("admin", "platformAi.testing")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {c.models.length} {t("admin", "platformAi.models")} · {t("admin", "platformAi.keyLabel")} <span className="font-mono">{c.maskedKey}</span>
                      {testResult?.error && <span className="text-rose-400"> · {testResult.error.slice(0, 60)}</span>}
                    </p>
                  </div>
                  {/* Model selector + Test button */}
                  <div className="flex items-center gap-1.5">
                    {/* Set as Default badge/button */}
                    {c.isDefault ? (
                      <Badge className="bg-violet-500/15 text-violet-300">
                        {t("admin", "platformAi.defaultBadge")}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSetDefault(c.providerId)}
                        className="text-[10px] text-muted-foreground hover:text-violet-300"
                        title={t("admin", "platformAi.titleSetDefault")}
                      >
                        {t("admin", "platformAi.setDefault")}
                      </Button>
                    )}
                    <Select
                      value={testModelSelection[c.providerId] || c.models[0] || ""}
                      onValueChange={(v) => setTestModelSelection((prev) => ({ ...prev, [c.providerId]: v }))}
                    >
                      <SelectTrigger className="h-7 w-36 border-white/10 bg-white/[0.03] text-[10px]">
                        <SelectValue placeholder={t("admin", "platformAi.placeholderSelectModel")} />
                      </SelectTrigger>
                      <SelectContent>
                        {c.models.map((m: string) => (
                          <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTestKey(c.providerId, undefined, undefined, testModelSelection[c.providerId])}
                      disabled={testing === c.providerId}
                      className="border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10"
                    >
                      {testing === c.providerId ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1 h-3.5 w-3.5" />}
                      {t("admin", "platformAi.test")}
                    </Button>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(c)} title={t("admin", "platformAi.titleEdit")}>
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => handleDelete(c.providerId)} title={t("admin", "platformAi.titleRemove")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add provider dropdown */}
        {available.length > 0 && !showAddForm && (
          <div className="mt-4">
            <Select value="" onValueChange={handleAdd}>
              <SelectTrigger className="bg-white/[0.03]"><SelectValue placeholder={t("admin", "platformAi.placeholderAddProvider")} /></SelectTrigger>
              <SelectContent>
                {available.map((p) => (
                  <SelectItem key={p.providerId} value={p.providerId}>
                    {p.name} ({p.category}) — {t("admin", "platformAi.modelsCount", { count: p.models.length })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Edit/Add form */}
        {showAddForm && (
          <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-cyan-200">
                {configured.find((c) => c.providerId === editProviderId) ? t("admin", "platformAi.edit") : t("admin", "platformAi.add")} {editProviderId}
              </p>
              <button onClick={() => setShowAddForm(false)} className="text-xs text-muted-foreground hover:text-foreground">✕ {t("common", "actions.cancel")}</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-muted-foreground">{t("admin", "platformAi.apiKey")}</label>
                <Input
                  type="password"
                  value={editApiKey}
                  onChange={(e) => setEditApiKey(e.target.value)}
                  placeholder={configured.find((c) => c.providerId === editProviderId) ? `•••• ${t("admin", "platformAi.apiKeySaved")}` : t("admin", "platformAi.apiKeyPlaceholder")}
                  className="bg-white/[0.03] font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-muted-foreground">{t("admin", "platformAi.baseUrl")}</label>
                <Input value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} className="bg-white/[0.03] font-mono text-xs" />
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <label className="text-[10px] uppercase text-muted-foreground">{t("admin", "platformAi.availableModels", { count: editModels.length })}</label>
              <div className="flex flex-wrap gap-1">
                {editModels.map((m) => (
                  <span key={m} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-mono">{m}</span>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={handleSave} disabled={saving} size="sm" className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                {saving ? t("admin", "platformAi.saving") : t("admin", "platformAi.saveProvider")}
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={editEnabled} onChange={(e) => setEditEnabled(e.target.checked)} className="rounded" />
                {t("admin", "platformAi.enabled")}
              </label>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
