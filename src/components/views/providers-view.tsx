"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Plug,
  Plus,
  Trash2,
  KeyRound,
  Globe,
  Cpu,
  Thermometer,
  Hash,
  Zap,
  Clock,
  Power,
  Check,
  Loader2,
  AlertCircle,
  X,
  ArrowRight,
  Activity,
  Sparkles,
  Server,
  Cloud,
  HardDrive,
  RefreshCw,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { GlassCard, GradientText, NeonDivider } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProvidersStore } from "@/lib/providers-store";
import { useT } from "@/lib/i18n";
import { PROVIDER_PRESETS, PRESET_BY_ID, FEATURE_LABELS, FEATURE_DEFAULTS } from "@/lib/providers";
import type { AIProvider, FeatureKind, ProviderId, ProviderPreset } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { color: string; label: string; icon: typeof Power }> = {
  unknown: { color: "#94a3b8", label: "Not tested", icon: Activity },
  testing: { color: "#fbbf24", label: "Testing…", icon: Loader2 },
  connected: { color: "#34d399", label: "Connected", icon: Check },
  error: { color: "#fb7185", label: "Error", icon: AlertCircle },
};

export function ProvidersView() {
  const { t } = useT();
  const providers = useProvidersStore((s) => s.providers);
  const addProvider = useProvidersStore((s) => s.addProvider);
  const [adding, setAdding] = useState(false);

  const enabledCount = providers.filter((p) => p.enabled).length;
  const localCount = providers.filter((p) => PRESET_BY_ID[p.providerId]?.local).length;
  const connectedCount = providers.filter((p) => p.status === "connected").length;
  const avgLatency = (() => {
    const lat = providers.filter((p) => p.latencyMs).map((p) => p.latencyMs!);
    return lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
  })();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Plug className="h-4 w-4 text-cyan-300" />
            <span>{t("providers", "localFirst")}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">
            <GradientText>{t("providers", "title")}</GradientText>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("providers", "subtitle")}
          </p>
        </div>
        <Button
          onClick={() => setAdding(true)}
          className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90"
        >
          <Plus className="mr-1.5 h-4 w-4" /> {t("providers", "addProvider")}
        </Button>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Power} label={t("providers", "statEnabled")} value={enabledCount} sub={`of ${providers.length} added`} color="#22d3ee" />
        <StatCard icon={Check} label={t("providers", "statConnected")} value={connectedCount} sub="reachable now" color="#34d399" />
        <StatCard icon={HardDrive} label={t("providers", "statLocalModels")} value={localCount} sub="Ollama / LM Studio" color="#a78bfa" />
        <StatCard icon={Clock} label={t("providers", "statAvgLatency")} value={avgLatency} sub="ms (last test)" color="#fbbf24" suffix="ms" />
      </div>

      {/* Feature routing overview */}
      <FeatureRoutingCard />

      {/* Provider list / empty state */}
      {providers.length === 0 ? (
        <EmptyState onAdd={() => setAdding(true)} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Connected Providers ({providers.length})
            </h2>
          </div>
          {providers.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <ProviderCard provider={p} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Add provider dialog */}
      <AddProviderDialog open={adding} onOpenChange={setAdding} onPick={(pid) => { addProvider(pid); toast.success(t("notifications", "providerAdded", { name: PRESET_BY_ID[pid].name })); setAdding(false); }} />
    </div>
  );
}

/* ---------- Stat card ---------- */
function StatCard({ icon: Icon, label, value, sub, color, suffix }: { icon: typeof Power; label: string; value: number; sub: string; color: string; suffix?: string }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${color}1a`, color, border: `1px solid ${color}33` }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value}{suffix}
      </p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </GlassCard>
  );
}

/* ---------- Feature routing ---------- */
function FeatureRoutingCard() {
  const { t } = useT();
  const providers = useProvidersStore((s) => s.providers);
  const routing = useProvidersStore((s) => s.routing);
  const setRouting = useProvidersStore((s) => s.setRouting);
  const enabledProviders = providers.filter((p) => p.enabled);
  const features = Object.keys(FEATURE_LABELS) as FeatureKind[];

  return (
    <GlassCard strong className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-cyan-300" />
        <h2 className="text-sm font-semibold">{t("providers", "featureRouting")}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("providers", "featureRoutingDesc")}
      </p>
      <NeonDivider className="my-4" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => {
          const current = routing[f];
          const defaultPid = FEATURE_DEFAULTS[f];
          const preset = PRESET_BY_ID[defaultPid];
          const assigned = providers.find((p) => p.id === current);
          return (
            <div key={f} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{FEATURE_LABELS[f]}</span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                  default {preset.name}
                </span>
              </div>
              <Select
                value={current ?? "__default__"}
                onValueChange={(v) => setRouting(f, v === "__default__" ? undefined : v)}
              >
                <SelectTrigger className="mt-2 h-8 border-white/10 bg-white/[0.03] text-xs">
                  <SelectValue placeholder="Use default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Use default ({preset.name})</SelectItem>
                  {enabledProviders.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label} · {p.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assigned && (
                <p className="mt-1.5 truncate text-[10px] text-cyan-300">
                  → {assigned.label} · {assigned.model}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {enabledProviders.length === 0 && (
        <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs text-amber-300">
          Enable at least one provider to customise routing. Until then, the built-in AI is used for all features.
        </p>
      )}
    </GlassCard>
  );
}

/* ---------- Empty state ---------- */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useT();
  return (
    <GlassCard strong className="relative overflow-hidden p-12 text-center">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
      <Plug className="relative mx-auto h-12 w-12 text-cyan-300" />
      <h2 className="relative mt-4 text-2xl font-bold">{t("providers", "connectYourAI")}</h2>
      <p className="relative mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {t("providers", "connectYourAIDesc")}
      </p>
      <Button onClick={onAdd} className="relative mt-5 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
        <Plus className="mr-1.5 h-4 w-4" /> {t("providers", "addFirst")}
      </Button>
    </GlassCard>
  );
}

/* ---------- Provider card ---------- */
function ProviderCard({ provider }: { provider: AIProvider }) {
  const update = useProvidersStore((s) => s.updateProvider);
  const remove = useProvidersStore((s) => s.removeProvider);
  const setStatus = useProvidersStore((s) => s.setProviderStatus);
  const [expanded, setExpanded] = useState(false);
  const preset = PRESET_BY_ID[provider.providerId];
  const status = STATUS_META[provider.status ?? "unknown"];
  const SIcon = status.icon;
  const isLocal = preset.local;
  const maskedKey = provider.apiKey
    ? `${provider.apiKey.slice(0, 4)}…${provider.apiKey.slice(-4)}`
    : "Not set";

  const testConnection = async () => {
    setStatus(provider.id, "testing");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.providerId,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          model: provider.model,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // Handle non-JSON responses (HTML error pages from gateway, etc.)
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text().catch(() => "");
        const shortErr = text.substring(0, 150) || `HTTP ${res.status}`;
        setStatus(provider.id, "error", 0, shortErr);
        toast.error(`Server returned ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data.status === "connected") {
        setStatus(provider.id, "connected", data.latencyMs);
        toast.success(`${preset.name} connected · ${data.latencyMs}ms`);
      } else {
        setStatus(provider.id, "error", data.latencyMs, data.error);
        toast.error(data.error || "Connection failed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const display = msg.includes("aborted") ? "Request timed out (30s)"
        : msg.includes("JSON") ? "Network error — server returned HTML instead of JSON"
        : msg;
      setStatus(provider.id, "error", undefined, display);
      toast.error(display);
    }
  };

  return (
    <GlassCard className="overflow-hidden">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
          style={{ background: `${preset.accent}1a`, color: preset.accent, border: `1px solid ${preset.accent}33` }}
        >
          {preset.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{provider.label}</p>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] uppercase"
              style={{ background: `${status.color}1a`, color: status.color, border: `1px solid ${status.color}33` }}
            >
              <SIcon className={cn("h-2.5 w-2.5", provider.status === "testing" && "animate-spin")} />
              {status.label}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              {isLocal ? <HardDrive className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
              {preset.category}
            </span>
            <span className="flex items-center gap-1 font-mono"><Cpu className="h-3 w-3" />{provider.model}</span>
            <span className="flex items-center gap-1 font-mono"><KeyRound className="h-3 w-3" />{maskedKey}</span>
            {provider.latencyMs != null && (
              <span className="flex items-center gap-1 text-emerald-400"><Clock className="h-3 w-3" />{provider.latencyMs}ms</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
            <Power className="h-3.5 w-3.5 text-muted-foreground" />
            <Switch
              checked={provider.enabled}
              onCheckedChange={(v) => update(provider.id, { enabled: v })}
            />
          </div>
          <Button size="sm" variant="outline" onClick={testConnection} disabled={provider.status === "testing"}>
            {provider.status === "testing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Test
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExpanded((e) => !e)}>
            <Settings2 className="h-3.5 w-3.5" />
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* Expanded config */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <Field icon={Hash} label="Display label">
                <Input value={provider.label} onChange={(e) => update(provider.id, { label: e.target.value })} className="bg-white/[0.03]" />
              </Field>
              <Field icon={Cpu} label="Model">
                <Select value={provider.model} onValueChange={(v) => update(provider.id, { model: v })}>
                  <SelectTrigger className="bg-white/[0.03]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {preset.models.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                    <SelectItem value={provider.model}>{provider.model} (custom)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field icon={KeyRound} label="API Key" hint="stored locally only">
                <Input
                  type="password"
                  value={provider.apiKey}
                  onChange={(e) => update(provider.id, { apiKey: e.target.value })}
                  placeholder={preset.requiresKey ? "sk-…" : "Optional for local"}
                  className="bg-white/[0.03] font-mono"
                />
              </Field>
              <Field icon={Globe} label="Base URL">
                <Input value={provider.baseUrl} onChange={(e) => update(provider.id, { baseUrl: e.target.value })} className="bg-white/[0.03] font-mono text-xs" />
              </Field>
              <Field icon={Thermometer} label={`Temperature · ${provider.temperature.toFixed(2)}`} hint="0 = deterministic, 2 = creative">
                <Slider
                  value={[provider.temperature]}
                  min={0}
                  max={2}
                  step={0.05}
                  onValueChange={([v]) => update(provider.id, { temperature: v })}
                />
              </Field>
              <Field icon={Hash} label="Max tokens" hint="-1 = unlimited">
                <Input
                  type="number"
                  value={provider.maxTokens}
                  onChange={(e) => update(provider.id, { maxTokens: Number(e.target.value) })}
                  className="bg-white/[0.03]"
                />
              </Field>
              <Field icon={Clock} label={`Timeout · ${provider.timeout}s`}>
                <Slider
                  value={[provider.timeout]}
                  min={5}
                  max={300}
                  step={5}
                  onValueChange={([v]) => update(provider.id, { timeout: v })}
                />
              </Field>
              <Field icon={Zap} label="Streaming" hint="stream tokens as they generate">
                <div className="flex h-9 items-center gap-2">
                  <Switch checked={provider.streaming} onCheckedChange={(v) => update(provider.id, { streaming: v })} />
                  <span className="text-xs text-muted-foreground">{provider.streaming ? "Enabled" : "Disabled"}</span>
                </div>
              </Field>
            </div>
            <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
              {preset.docsUrl ? (
                <a href={preset.docsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-cyan-300 hover:underline">
                  Get API key <ArrowRight className="h-3 w-3" />
                </a>
              ) : <span />}
              <Button size="sm" variant="destructive" onClick={() => { remove(provider.id); toast.success("Provider removed"); }}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {provider.error && (
        <div className="border-t border-rose-500/20 bg-rose-500/[0.04] px-4 py-2 text-xs text-rose-300">
          {provider.error}
        </div>
      )}
    </GlassCard>
  );
}

function Field({ icon: Icon, label, hint, children }: { icon: typeof Hash; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
        {hint && <span className="text-[10px] text-muted-foreground/70">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}

/* ---------- Add provider dialog ---------- */
function AddProviderDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (b: boolean) => void; onPick: (pid: ProviderId) => void }) {
  const grouped = {
    Aggregator: PROVIDER_PRESETS.filter((p) => p.category === "Aggregator"),
    Cloud: PROVIDER_PRESETS.filter((p) => p.category.startsWith("Cloud")),
    Local: PROVIDER_PRESETS.filter((p) => p.local),
    Enterprise: PROVIDER_PRESETS.filter((p) => p.category === "Enterprise"),
    Custom: PROVIDER_PRESETS.filter((p) => p.category === "Custom"),
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-white/10 bg-popover/95 backdrop-blur-2xl scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-cyan-300" /> Add AI Provider
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose a provider. Configure API key, base URL, and model after adding. Keys are stored only in your browser.
          </p>
        </DialogHeader>
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">{group}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((p) => (
                  <ProviderPick key={p.providerId} preset={p} onPick={() => onPick(p.providerId)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProviderPick({ preset, onPick }: { preset: ProviderPreset; onPick: () => void }) {
  const Icon = preset.local ? HardDrive : preset.category === "Aggregator" ? Server : Cloud;
  return (
    <button
      onClick={onPick}
      className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-cyan-400/40 hover:bg-white/[0.04]"
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${preset.accent}1a`, color: preset.accent, border: `1px solid ${preset.accent}33` }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{preset.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">{preset.defaultModel}</p>
      </div>
      <Plus className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-cyan-300" />
    </button>
  );
}
