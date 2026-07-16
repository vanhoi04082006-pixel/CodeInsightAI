"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  Settings as SettingsIcon,
  User,
  Cpu,
  Bell,
  Palette,
  KeyRound,
  Github,
  Check,
  Sparkles,
  Shield,
  Zap,
  ArrowRight,
  Bot,
  Terminal,
  Hash,
  Clock,
  Quote,
  Brain,
  ScrollText,
  ListChecks,
  FileSearch,
} from "lucide-react";
import { GlassCard, GradientText, NeonDivider } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import { usePersonalityStore } from "@/lib/personality-store";
import { useProvidersStore } from "@/lib/providers-store";
import { useDeveloperModeStore } from "@/lib/developer-mode-store";
import { BUILTIN_PERSONALITIES } from "@/lib/personalities";
import { PRESET_BY_ID, PROVIDER_PRESETS, FEATURE_LABELS } from "@/lib/providers";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const [theme, setTheme] = useState("dark");
  const [notifications, setNotifications] = useState({ email: true, push: false, weekly: true });
  const [connected, setConnected] = useState({ github: false, google: true });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold md:text-3xl">
          <GradientText>Settings</GradientText>
        </h1>
        <p className="text-sm text-muted-foreground">Manage your account, AI models, and preferences.</p>
      </motion.div>

      <div className="mt-6">
        <Tabs defaultValue="account">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="account" className="gap-1.5"><User className="h-3.5 w-3.5" /> Account</TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5"><Cpu className="h-3.5 w-3.5" /> AI</TabsTrigger>
            <TabsTrigger value="developer" className="gap-1.5"><Terminal className="h-3.5 w-3.5" /> Developer</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> Alerts</TabsTrigger>
            <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-3.5 w-3.5" /> Theme</TabsTrigger>
          </TabsList>

          {/* Account */}
          <TabsContent value="account" className="mt-4 space-y-4">
            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><User className="h-4 w-4 text-cyan-300" /> Profile</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Display name" defaultValue="Z.ai Developer" />
                <Field label="Email" defaultValue="dev@codeinsight.ai" />
                <Field label="Company" defaultValue="Independent" />
                <Field label="Role" defaultValue="Staff Engineer" />
              </div>
              <Button onClick={() => toast.success("Profile saved")} className="mt-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
                Save changes
              </Button>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-cyan-300" /> Connected accounts</h3>
              <div className="mt-4 space-y-2">
                <ConnectRow
                  icon={Github}
                  name="GitHub"
                  desc="Connect to analyse private repositories"
                  connected={connected.github}
                  onToggle={() => { setConnected((c) => ({ ...c, github: !c.github })); toast.success(connected.github ? "GitHub disconnected" : "GitHub connected"); }}
                />
                <ConnectRow
                  icon={Sparkles}
                  name="Google"
                  desc="Sign in with Google OAuth"
                  connected={connected.google}
                  onToggle={() => { setConnected((c) => ({ ...c, google: !c.google })); toast.success(connected.google ? "Google disconnected" : "Google connected"); }}
                />
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Shield className="h-4 w-4 text-rose-400" /> Danger zone</h3>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
                <div>
                  <p className="text-sm font-medium">Delete account</p>
                  <p className="text-xs text-muted-foreground">Permanently remove all your analyses and data.</p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => toast.error("Demo only — account not deleted")}>
                  Delete
                </Button>
              </div>
            </GlassCard>
          </TabsContent>

          {/* AI */}
          <TabsContent value="ai" className="mt-4 space-y-4">
            {/* Providers pointer */}
            <GlassCard strong className="p-6">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-300" />
                <h3 className="text-sm font-semibold">AI Providers</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                CodeInsight AI is local-first. You connect your own AI providers (OpenRouter, OpenAI, Anthropic,
                Gemini, DeepSeek, Groq, Ollama, LM Studio, and more) and route different features to different models.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
                  <Cpu className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Manage providers & model routing</p>
                  <p className="text-[11px] text-muted-foreground">Add API keys, test connections, assign models to features.</p>
                </div>
                <Button onClick={() => useAppStore.getState().setView("providers")} className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
                  Open Providers <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </GlassCard>

            {/* AI config: provider, model, personality, temperature, max tokens */}
            <AISettingsCard />

            {/* Personalities pointer */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet-300" />
                <h3 className="text-sm font-semibold">AI Personality</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Customize how the AI behaves across chat, code review, bug analysis, docs, and architecture.
                The selected personality injects its system prompt before every AI request.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.04] p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-400/15 text-violet-300">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Manage personalities</p>
                  <p className="text-[11px] text-muted-foreground">5 built-in (Professional, Friendly, Technical, CTO, Teacher) + custom.</p>
                </div>
                <Button onClick={() => useAppStore.getState().setView("personalities")} className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
                  Open Personalities <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-amber-400" /> Analysis depth</h3>
              <div className="mt-4 space-y-3">
                <ToggleRow label="Deep static analysis" desc="Run full AST parsing and complexity metrics (slower)." defaultChecked />
                <ToggleRow label="Security scanning" desc="Scan for secrets, vulnerabilities, and misconfigurations." defaultChecked />
                <ToggleRow label="Generate embeddings" desc="Enable semantic code search and richer AI chat." defaultChecked />
                <ToggleRow label="Auto-generate docs" desc="Produce README, API docs, and diagrams automatically." defaultChecked />
              </div>
            </GlassCard>
          </TabsContent>

          {/* Developer */}
          <TabsContent value="developer" className="mt-4 space-y-4">
            <DeveloperSettingsCard />
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications" className="mt-4">
            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4 text-cyan-300" /> Notifications</h3>
              <div className="mt-4 space-y-3">
                <ToggleRow
                  label="Email alerts"
                  desc="Get notified when an analysis completes."
                  checked={notifications.email}
                  onCheckedChange={(v) => setNotifications((n) => ({ ...n, email: v }))}
                />
                <ToggleRow
                  label="Push notifications"
                  desc="Real-time browser push for critical findings."
                  checked={notifications.push}
                  onCheckedChange={(v) => setNotifications((n) => ({ ...n, push: v }))}
                />
                <ToggleRow
                  label="Weekly digest"
                  desc="A summary of your analyses every Monday."
                  checked={notifications.weekly}
                  onCheckedChange={(v) => setNotifications((n) => ({ ...n, weekly: v }))}
                />
              </div>
            </GlassCard>
          </TabsContent>

          {/* Appearance */}
          <TabsContent value="appearance" className="mt-4">
            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-cyan-300" /> Theme</h3>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { id: "dark", name: "Cyber Dark", preview: "from-slate-900 to-violet-950" },
                  { id: "midnight", name: "Midnight", preview: "from-slate-950 to-cyan-950" },
                  { id: "aurora", name: "Aurora", preview: "from-violet-900 to-cyan-900" },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setTheme(t.id); toast.success(`Theme: ${t.name}`); }}
                    className={cn(
                      "overflow-hidden rounded-xl border-2 transition",
                      theme === t.id ? "border-cyan-400" : "border-white/10 hover:border-white/20"
                    )}
                  >
                    <div className={cn("h-20 bg-gradient-to-br", t.preview)} />
                    <div className="p-2 text-center">
                      <p className="text-xs font-medium">{t.name}</p>
                    </div>
                  </button>
                ))}
              </div>
              <NeonDivider className="my-4" />
              <div className="space-y-3">
                <ToggleRow label="Reduced motion" desc="Minimise animations for accessibility." />
                <ToggleRow label="Compact mode" desc="Denser spacing for power users." />
                <ToggleRow label="Show grid background" desc="Display the neural-network background." defaultChecked />
              </div>
            </GlassCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      <Input defaultValue={defaultValue} className="bg-white/[0.03]" />
    </div>
  );
}

function ConnectRow({ icon: Icon, name, desc, connected, onToggle }: { icon: typeof Github; name: string; desc: string; connected: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
        <Icon className="h-4 w-4 text-foreground/70" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      {connected ? (
        <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
          <Check className="h-3 w-3" /> Connected
        </span>
      ) : null}
      <Button size="sm" variant={connected ? "outline" : "default"} onClick={onToggle} className={connected ? "" : "bg-gradient-to-r from-cyan-500 to-violet-500 text-white"}>
        {connected ? "Disconnect" : "Connect"}
      </Button>
    </div>
  );
}

function ToggleRow({ label, desc, defaultChecked, checked, onCheckedChange }: { label: string; desc: string; defaultChecked?: boolean; checked?: boolean; onCheckedChange?: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <Switch defaultChecked={defaultChecked} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/* ---------- AI Settings Card (provider / model / personality / temperature / max tokens) ---------- */
function AISettingsCard() {
  const providers = useProvidersStore((s) => s.providers);
  const routing = useProvidersStore((s) => s.routing);
  const setRouting = useProvidersStore((s) => s.setRouting);
  const updateProvider = useProvidersStore((s) => s.updateProvider);
  const personalities = usePersonalityStore((s) => s.all());
  const activePersonality = usePersonalityStore((s) => s.getActive());
  const setActivePersonality = usePersonalityStore((s) => s.setActive);

  const enabledProviders = providers.filter((p) => p.enabled);
  const chatProviderId = routing.chat;
  const chatProvider = enabledProviders.find((p) => p.id === chatProviderId);

  return (
    <GlassCard className="p-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4 text-cyan-300" /> AI Configuration</h3>
      <p className="mt-1 text-xs text-muted-foreground">Defaults applied to the AI Chat. Override per-feature in the Providers view.</p>
      <div className="mt-4 space-y-4">
        {/* Provider */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Cpu className="h-3 w-3" /> Provider (for chat)</label>
          <Select value={chatProviderId ?? "__default__"} onValueChange={(v) => setRouting("chat", v === "__default__" ? undefined : v)}>
            <SelectTrigger className="bg-white/[0.03]"><SelectValue placeholder="Use built-in AI" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Built-in AI (no provider)</SelectItem>
              {enabledProviders.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label} · {p.model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {enabledProviders.length === 0 && (
            <p className="text-[10px] text-amber-400">No enabled providers — using the built-in AI. Enable one in the Providers view.</p>
          )}
        </div>

        {/* Model (editable if a provider is selected) */}
        {chatProvider && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Cpu className="h-3 w-3" /> Model</label>
            <Select value={chatProvider.model} onValueChange={(v) => updateProvider(chatProvider.id, { model: v })}>
              <SelectTrigger className="bg-white/[0.03]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(PRESET_BY_ID[chatProvider.providerId]?.models ?? [chatProvider.model]).map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Personality */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Bot className="h-3 w-3" /> Personality</label>
          <Select value={activePersonality.id} onValueChange={(v) => { setActivePersonality(v); toast.success(`Personality: ${personalities.find((p) => p.id === v)?.name}`); }}>
            <SelectTrigger className="bg-white/[0.03]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {personalities.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
                    {p.name} {p.builtin ? "(built-in)" : "(custom)"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">{activePersonality.description}</p>
        </div>

        {/* Temperature */}
        <div className="space-y-1.5">
          <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /> Temperature</span>
            <span className="tabular-nums text-cyan-300">{activePersonality.temperature.toFixed(2)}</span>
          </label>
          <Slider
            value={[activePersonality.temperature]}
            min={0}
            max={2}
            step={0.05}
            onValueChange={([v]) => {
              // live-update the active personality's temperature (only meaningful for custom; built-ins ignore on next reload)
              if (!activePersonality.builtin) {
                usePersonalityStore.getState().updateCustom(activePersonality.id, { temperature: v });
              } else {
                toast.info("Built-in personalities are read-only. Duplicate to customise.");
              }
            }}
          />
          <p className="text-[10px] text-muted-foreground">0 = deterministic · 2 = creative</p>
        </div>

        {/* Max tokens */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Hash className="h-3 w-3" /> Max tokens</label>
          <Input
            type="number"
            value={activePersonality.maxTokens}
            onChange={(e) => {
              if (!activePersonality.builtin) {
                usePersonalityStore.getState().updateCustom(activePersonality.id, { maxTokens: Number(e.target.value) });
              }
            }}
            className="bg-white/[0.03]"
          />
          <p className="text-[10px] text-muted-foreground">-1 = unlimited</p>
        </div>
      </div>
    </GlassCard>
  );
}

/* ---------- Developer Settings Card ---------- */
function DeveloperSettingsCard() {
  const enabled = useDeveloperModeStore((s) => s.enabled);
  const setEnabled = useDeveloperModeStore((s) => s.setEnabled);
  const toggles = useDeveloperModeStore((s) => ({
    showTokenUsage: s.showTokenUsage,
    showResponseTime: s.showResponseTime,
    showPromptDebug: s.showPromptDebug,
    showModelDebug: s.showModelDebug,
    showRawResponse: s.showRawResponse,
    showRequestLogs: s.showRequestLogs,
    showResponseLogs: s.showResponseLogs,
    showAdvancedDebug: s.showAdvancedDebug,
  }));
  const setToggle = useDeveloperModeStore((s) => s.setToggle);
  const clearLogs = useDeveloperModeStore((s) => s.clearLogs);
  const clearSnapshots = useDeveloperModeStore((s) => s.clearSnapshots);

  const debugToggles: { key: keyof typeof toggles; label: string; desc: string; icon: typeof Hash }[] = [
    { key: "showTokenUsage", label: "Show Token Usage", desc: "Input / output / total tokens per request.", icon: Hash },
    { key: "showResponseTime", label: "Show API Response Time", desc: "Queue, generation, and total latency.", icon: Clock },
    { key: "showPromptDebug", label: "Show Prompt Debug", desc: "System prompt, user prompt, repo context, final prompt.", icon: Quote },
    { key: "showModelDebug", label: "Show Model Debug", desc: "Provider, model, context window, capabilities.", icon: Brain },
    { key: "showRawResponse", label: "Show Raw AI Response", desc: "Original response before formatting.", icon: ScrollText },
    { key: "showRequestLogs", label: "Show Request Logs", desc: "Timestamp, request ID, duration, status.", icon: ListChecks },
    { key: "showResponseLogs", label: "Show Response Logs", desc: "Detailed response log entries.", icon: ListChecks },
    { key: "showAdvancedDebug", label: "Show Advanced Debug", desc: "Embeddings, vector search, chunk ranking, repo index.", icon: FileSearch },
  ];

  return (
    <>
      <GlassCard strong className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-violet-300" />
            <h3 className="text-sm font-semibold">Developer Mode</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
            <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); toast.success(v ? "Developer Mode enabled" : "Developer Mode disabled"); }} />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          For advanced users. Displays an expandable Developer Panel in the AI Chat with token usage, performance,
          prompt construction, model capabilities, raw responses, and request logs.
        </p>
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-2.5 text-[11px] text-emerald-300">
          <Shield className="h-3 w-3" />
          API keys, tokens, and credentials are automatically masked in all debug output.
        </div>
      </GlassCard>

      {enabled && (
        <>
          <GlassCard className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Terminal className="h-4 w-4 text-cyan-300" /> Debug Panels</h3>
            <p className="mt-1 text-xs text-muted-foreground">Choose which sections appear in the Developer Panel.</p>
            <div className="mt-4 space-y-2">
              {debugToggles.map((t) => {
                const Icon = t.icon;
                return (
                  <div key={t.key} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                      </div>
                    </div>
                    <Switch checked={toggles[t.key]} onCheckedChange={(v) => setToggle(t.key, v)} />
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-amber-400" /> Debug Data</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { clearLogs(); toast.success("Logs cleared"); }}>Clear request logs</Button>
              <Button size="sm" variant="outline" onClick={() => { clearSnapshots(); toast.success("Snapshots cleared"); }}>Clear debug snapshots</Button>
            </div>
          </GlassCard>
        </>
      )}
    </>
  );
}
