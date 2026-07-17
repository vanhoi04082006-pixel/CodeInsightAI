"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
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
  Globe,
  Eye,
  Sun,
  Moon,
  Monitor,
  Gauge,
} from "lucide-react";
import { GlassCard, GradientText, NeonDivider } from "@/components/shared/ui";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
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
import { usePersonalizationStore, ACCENTS, type AccentColor, type AnimationLevel, type UIDensity, type FontSize, type ColorBlindMode } from "@/lib/personalization-store";
import { useI18nStore, SUPPORTED_LOCALES, useT } from "@/lib/i18n";
import { BUILTIN_PERSONALITIES, PERSONALITY_BY_ID } from "@/lib/personalities";
import { PRESET_BY_ID, PROVIDER_PRESETS, FEATURE_LABELS } from "@/lib/providers";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const { t } = useT();
  const [notifications, setNotifications] = useState({ email: true, push: false, weekly: true });
  const [connected, setConnected] = useState({ github: false, google: true });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold md:text-3xl">
          <GradientText>{t("settings", "title")}</GradientText>
        </h1>
        <p className="text-sm text-muted-foreground">{t("settings", "subtitle")}</p>
      </motion.div>

      <div className="mt-6">
        <Tabs defaultValue="account">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            <TabsTrigger value="account" className="gap-1.5"><User className="h-3.5 w-3.5" /> <span className="hidden lg:inline">{t("settings", "tabs.account")}</span></TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5"><Cpu className="h-3.5 w-3.5" /> {t("settings", "tabs.ai")}</TabsTrigger>
            <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-3.5 w-3.5" /> <span className="hidden lg:inline">{t("settings", "tabs.appearance")}</span></TabsTrigger>
            <TabsTrigger value="language" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> <span className="hidden lg:inline">{t("settings", "tabs.language")}</span></TabsTrigger>
            <TabsTrigger value="accessibility" className="gap-1.5"><Eye className="h-3.5 w-3.5" /> <span className="hidden lg:inline">{t("settings", "tabs.accessibility")}</span></TabsTrigger>
            <TabsTrigger value="developer" className="gap-1.5"><Terminal className="h-3.5 w-3.5" /> <span className="hidden lg:inline">{t("settings", "tabs.developer")}</span></TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> <span className="hidden lg:inline">{t("settings", "tabs.notifications")}</span></TabsTrigger>
          </TabsList>

          {/* Account */}
          <TabsContent value="account" className="mt-4 space-y-4">
            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><User className="h-4 w-4 text-cyan-300" /> {t("settings", "profile")}</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label={t("settings", "displayName")} defaultValue="Z.ai Developer" />
                <Field label={t("settings", "email")} defaultValue="dev@codeinsight.ai" />
                <Field label={t("settings", "company")} defaultValue="Independent" />
                <Field label={t("settings", "role")} defaultValue="Staff Engineer" />
              </div>
              <Button onClick={() => toast.success(t("settings", "profileSaved"))} className="mt-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
                {t("settings", "saveChanges")}
              </Button>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-cyan-300" /> {t("settings", "connectedAccounts")}</h3>
              <div className="mt-4 space-y-2">
                <ConnectRow
                  icon={Github}
                  name="GitHub"
                  desc={t("settings", "githubDesc")}
                  connected={connected.github}
                  onToggle={() => { setConnected((c) => ({ ...c, github: !c.github })); toast.success(connected.github ? t("common", "status.disconnected") : t("common", "status.connected")); }}
                />
                <ConnectRow
                  icon={Sparkles}
                  name="Google"
                  desc={t("settings", "googleDesc")}
                  connected={connected.google}
                  onToggle={() => { setConnected((c) => ({ ...c, google: !c.google })); toast.success(connected.google ? t("common", "status.disconnected") : t("common", "status.connected")); }}
                />
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Shield className="h-4 w-4 text-rose-400" /> {t("settings", "dangerZone")}</h3>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
                <div>
                  <p className="text-sm font-medium">{t("settings", "deleteAccount")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings", "deleteAccountDesc")}</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    if (!confirm("⚠️ This will permanently delete ALL analyses, chat messages, and history. This cannot be undone. Are you sure?")) return;
                    try {
                      const res = await fetch("/api/reset", { method: "POST" });
                      const data = await res.json();
                      if (data.success) {
                        useAppStore.getState().setActiveReport(null);
                        useAppStore.getState().setActiveAnalysisId(null);
                        useAppStore.getState().clearChat();
                        usePersonalityStore.getState().custom.forEach((p) => usePersonalityStore.getState().removeCustom(p.id));
                        useProvidersStore.getState().providers.forEach((p) => useProvidersStore.getState().removeProvider(p.id));
                        useDeveloperModeStore.getState().clearLogs();
                        useDeveloperModeStore.getState().clearSnapshots();
                        toast.success(`Deleted ${data.deleted.analyses} analyses and ${data.deleted.chatMessages} chat messages. All data reset.`);
                        setTimeout(() => window.location.reload(), 1500);
                      } else {
                        toast.error(data.error || "Reset failed");
                      }
                    } catch (e) {
                      toast.error("Network error — please try again");
                    }
                  }}
                >
                  {t("settings", "delete")}
                </Button>
              </div>
            </GlassCard>
          </TabsContent>

          {/* AI */}
          <TabsContent value="ai" className="mt-4 space-y-4">
            <GlassCard strong className="p-6">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-300" />
                <h3 className="text-sm font-semibold">{t("settings", "aiProviders")}</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("settings", "aiProvidersDesc")}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
                  <Cpu className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t("settings", "manageProviders")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("settings", "manageProvidersDesc")}</p>
                </div>
                <Button onClick={() => useAppStore.getState().setView("providers")} className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
                  {t("settings", "openProviders")} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </GlassCard>

            <AISettingsCard />

            <GlassCard className="p-6">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet-300" />
                <h3 className="text-sm font-semibold">{t("settings", "aiPersonality")}</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("settings", "aiPersonalityDesc")}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.04] p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-400/15 text-violet-300">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t("settings", "managePersonalities")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("settings", "managePersonalitiesDesc")}</p>
                </div>
                <Button onClick={() => useAppStore.getState().setView("personalities")} className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
                  {t("settings", "openPersonalities")} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-amber-400" /> {t("settings", "analysisDepth")}</h3>
              <div className="mt-4 space-y-3">
                <ToggleRow label={t("settings", "deepStatic")} desc={t("settings", "deepStaticDesc")} defaultChecked />
                <ToggleRow label={t("settings", "securityScanning")} desc={t("settings", "securityScanningDesc")} defaultChecked />
                <ToggleRow label={t("settings", "generateEmbeddings")} desc={t("settings", "generateEmbeddingsDesc")} defaultChecked />
                <ToggleRow label={t("settings", "autoDocs")} desc={t("settings", "autoDocsDesc")} defaultChecked />
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
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4 text-cyan-300" /> {t("settings", "notifications")}</h3>
              <div className="mt-4 space-y-3">
                <ToggleRow
                  label={t("settings", "emailAlerts")}
                  desc={t("settings", "emailAlertsDesc")}
                  checked={notifications.email}
                  onCheckedChange={(v) => setNotifications((n) => ({ ...n, email: v }))}
                />
                <ToggleRow
                  label={t("settings", "pushNotifications")}
                  desc={t("settings", "pushNotificationsDesc")}
                  checked={notifications.push}
                  onCheckedChange={(v) => setNotifications((n) => ({ ...n, push: v }))}
                />
                <ToggleRow
                  label={t("settings", "weeklyDigest")}
                  desc={t("settings", "weeklyDigestDesc")}
                  checked={notifications.weekly}
                  onCheckedChange={(v) => setNotifications((n) => ({ ...n, weekly: v }))}
                />
              </div>
            </GlassCard>
          </TabsContent>

          {/* Appearance */}
          <TabsContent value="appearance" className="mt-4 space-y-4">
            <AppearanceSettingsCard />
          </TabsContent>

          {/* Language */}
          <TabsContent value="language" className="mt-4 space-y-4">
            <LanguageSettingsCard />
          </TabsContent>

          {/* Accessibility */}
          <TabsContent value="accessibility" className="mt-4 space-y-4">
            <AccessibilitySettingsCard />
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
  const { t } = useT();
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
          <Check className="h-3 w-3" /> {t("common", "status.connected")}
        </span>
      ) : null}
      <Button size="sm" variant={connected ? "outline" : "default"} onClick={onToggle} className={connected ? "" : "bg-gradient-to-r from-cyan-500 to-violet-500 text-white"}>
        {connected ? t("settings", "disconnect") : t("settings", "connect")}
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

/* ---------- AI Settings Card ---------- */
function AISettingsCard() {
  const { t } = useT();
  const providers = useProvidersStore((s) => s.providers);
  const routing = useProvidersStore((s) => s.routing);
  const setRouting = useProvidersStore((s) => s.setRouting);
  const updateProvider = useProvidersStore((s) => s.updateProvider);

  const customPersonalities = usePersonalityStore((s) => s.custom);
  const activePersonalityId = usePersonalityStore((s) => s.activeId);
  const setActivePersonality = usePersonalityStore((s) => s.setActive);

  const personalities = useMemo(() => [...BUILTIN_PERSONALITIES, ...customPersonalities], [customPersonalities]);
  const activePersonality = useMemo(
    () => PERSONALITY_BY_ID[activePersonalityId] ?? customPersonalities.find((p) => p.id === activePersonalityId) ?? PERSONALITY_BY_ID["cto"],
    [activePersonalityId, customPersonalities]
  );

  const enabledProviders = providers.filter((p) => p.enabled);
  const chatProviderId = routing.chat;
  const chatProvider = enabledProviders.find((p) => p.id === chatProviderId);

  return (
    <GlassCard className="p-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Cpu className="h-4 w-4 text-cyan-300" /> {t("settings", "aiConfig")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t("settings", "aiConfigDesc")}</p>

      <div className="mt-4 space-y-4">
        {/* Provider */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Cpu className="h-3 w-3" /> {t("settings", "providerChat")}</label>
          <Select value={chatProviderId ?? "__default__"} onValueChange={(v) => setRouting("chat", v === "__default__" ? undefined : v)}>
            <SelectTrigger className="bg-white/[0.03]"><SelectValue placeholder={t("settings", "builtInAI")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">{t("settings", "builtInAI")}</SelectItem>
              {enabledProviders.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label} — {p.model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {enabledProviders.length === 0 && (
            <p className="text-[10px] text-amber-400">{t("settings", "noEnabledProviders")}</p>
          )}
        </div>

        {/* Model */}
        {chatProvider && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Cpu className="h-3 w-3" /> {t("settings", "ai.model")}</label>
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
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Bot className="h-3 w-3" /> {t("settings", "personality")}</label>
          <Select value={activePersonality.id} onValueChange={(v) => { setActivePersonality(v); }}>
            <SelectTrigger className="bg-white/[0.03]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {personalities.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
                    {p.name} {p.builtin ? `(${t("personality", "builtin")})` : `(${t("personality", "custom")})`}
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
            <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /> {t("settings", "temperature")}</span>
            <span className="tabular-nums text-cyan-300">{activePersonality.temperature.toFixed(2)}</span>
          </label>
          <Slider
            value={[activePersonality.temperature]}
            min={0}
            max={2}
            step={0.05}
            onValueChange={([v]) => {
              if (!activePersonality.builtin) {
                usePersonalityStore.getState().updateCustom(activePersonality.id, { temperature: v });
              }
            }}
          />
          <p className="text-[10px] text-muted-foreground">{t("settings", "tempHint")}</p>
        </div>

        {/* Max tokens */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Hash className="h-3 w-3" /> {t("settings", "maxTokens")}</label>
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
          <p className="text-[10px] text-muted-foreground">{t("settings", "maxTokensHint")}</p>
        </div>
      </div>
    </GlassCard>
  );
}

/* ---------- Developer Settings Card ---------- */
function DeveloperSettingsCard() {
  const { t } = useT();
  const enabled = useDeveloperModeStore((s) => s.enabled);
  const setEnabled = useDeveloperModeStore((s) => s.setEnabled);

  const showTokenUsage = useDeveloperModeStore((s) => s.showTokenUsage);
  const showResponseTime = useDeveloperModeStore((s) => s.showResponseTime);
  const showPromptDebug = useDeveloperModeStore((s) => s.showPromptDebug);
  const showModelDebug = useDeveloperModeStore((s) => s.showModelDebug);
  const showRawResponse = useDeveloperModeStore((s) => s.showRawResponse);
  const showRequestLogs = useDeveloperModeStore((s) => s.showRequestLogs);
  const showResponseLogs = useDeveloperModeStore((s) => s.showResponseLogs);
  const showAdvancedDebug = useDeveloperModeStore((s) => s.showAdvancedDebug);

  const toggles = {
    showTokenUsage, showResponseTime, showPromptDebug, showModelDebug,
    showRawResponse, showRequestLogs, showResponseLogs, showAdvancedDebug,
  };

  const setToggle = useDeveloperModeStore((s) => s.setToggle);
  const clearLogs = useDeveloperModeStore((s) => s.clearLogs);
  const clearSnapshots = useDeveloperModeStore((s) => s.clearSnapshots);

  const debugToggles: { key: keyof typeof toggles; label: string; desc: string; icon: typeof Hash }[] = [
    { key: "showTokenUsage", label: t("settings", "developer.showTokenUsage"), desc: t("developer", "sections.tokenUsage"), icon: Hash },
    { key: "showResponseTime", label: t("settings", "developer.showResponseTime"), desc: t("developer", "sections.performance"), icon: Clock },
    { key: "showPromptDebug", label: t("settings", "developer.showPromptDebug"), desc: t("developer", "sections.promptDebug"), icon: Quote },
    { key: "showModelDebug", label: t("settings", "developer.showModelDebug"), desc: t("developer", "sections.modelInfo"), icon: Brain },
    { key: "showRawResponse", label: t("settings", "developer.showRawResponse"), desc: t("developer", "sections.rawResponse"), icon: ScrollText },
    { key: "showRequestLogs", label: t("settings", "developer.showRequestLogs"), desc: t("developer", "logs.title"), icon: ListChecks },
    { key: "showResponseLogs", label: t("settings", "developer.showResponseLogs"), desc: t("developer", "logs.title"), icon: ListChecks },
    { key: "showAdvancedDebug", label: t("settings", "developer.showAdvancedDebug"), desc: t("developer", "sections.advancedDebug"), icon: FileSearch },
  ];

  return (
    <>
      <GlassCard strong className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-violet-300" />
            <h3 className="text-sm font-semibold">{t("settings", "developer.title")}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{enabled ? t("common", "status.enabled") : t("common", "status.disabled")}</span>
            <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); }} />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("settings", "developer.subtitle")}
        </p>
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-2.5 text-[11px] text-emerald-300">
          <Shield className="h-3 w-3" />
          {t("settings", "developer.securityNote")}
        </div>
      </GlassCard>

      {enabled && (
        <>
          <GlassCard className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Terminal className="h-4 w-4 text-cyan-300" /> {t("settings", "debugPanels")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("settings", "debugPanelsDesc")}</p>
            <div className="mt-4 space-y-2">
              {debugToggles.map((tItem) => {
                const Icon = tItem.icon;
                return (
                  <div key={tItem.key} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{tItem.label}</p>
                        <p className="text-[11px] text-muted-foreground">{tItem.desc}</p>
                      </div>
                    </div>
                    <Switch checked={toggles[tItem.key]} onCheckedChange={(v) => setToggle(tItem.key, v)} />
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-amber-400" /> {t("settings", "debugData")}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { clearLogs(); toast.success(t("notifications", "logsCleared")); }}>{t("settings", "clearRequestLogs")}</Button>
              <Button size="sm" variant="outline" onClick={() => { clearSnapshots(); toast.success(t("notifications", "snapshotsCleared")); }}>{t("settings", "clearSnapshots")}</Button>
            </div>
          </GlassCard>
        </>
      )}
    </>
  );
}

/* ---------- Appearance Settings Card ---------- */
function AppearanceSettingsCard() {
  const { t } = useT();
  const { theme, accent, density, animation, setTheme, setAccent, setDensity, setAnimation } = usePersonalizationStore();

  return (
    <>
      <GlassCard strong className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-cyan-300" /> {t("settings", "appearance.theme")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("settings", "appearance.themeLight")}, {t("settings", "appearance.themeDark")}, {t("settings", "appearance.themeSystem")}</p>
        <div className="mt-4">
          <ThemeSwitcher />
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-violet-300" /> {t("settings", "appearance.accentColor")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("settings", "accentColorDesc")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => { setAccent(a.id); }}
              className={cn(
                "group relative flex h-12 w-12 items-center justify-center rounded-xl border-2 transition",
                accent === a.id ? "border-foreground" : "border-white/10 hover:border-white/30"
              )}
              style={{ background: a.color }}
              title={a.name}
            >
              {accent === a.id && <Check className="h-4 w-4 text-white drop-shadow" />}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-emerald-400" /> {t("settings", "appearance.uiDensity")}</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {([
            { id: "comfortable", name: t("settings", "appearance.densityComfortable") },
            { id: "compact", name: t("settings", "appearance.densityCompact") },
          ] as const).map((d) => (
            <button
              key={d.id}
              onClick={() => { setDensity(d.id); }}
              className={cn(
                "rounded-xl border p-4 text-left transition",
                density === d.id ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20"
              )}
            >
              <p className="text-sm font-medium">{d.name}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("settings", "uiDensityDesc")}</p>
      </GlassCard>

      <GlassCard className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-amber-400" /> {t("settings", "appearance.animationLevel")}</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([
            { id: "ultra", name: t("settings", "appearance.animUltra") },
            { id: "balanced", name: t("settings", "appearance.animBalanced") },
            { id: "performance", name: t("settings", "appearance.animPerformance") },
          ] as const).map((a) => (
            <button
              key={a.id}
              onClick={() => { setAnimation(a.id); }}
              className={cn(
                "rounded-xl border p-4 text-left transition",
                animation === a.id ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20"
              )}
            >
              <p className="text-sm font-medium">{a.name}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("settings", "animationDesc")}</p>
      </GlassCard>
    </>
  );
}

/* ---------- Language Settings Card ---------- */
function LanguageSettingsCard() {
  const { t } = useT();
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  return (
    <GlassCard strong className="p-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4 text-cyan-300" /> {t("settings", "language.title")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("settings", "language.autoDetect")}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SUPPORTED_LOCALES.map((l) => (
          <button
            key={l.id}
            onClick={() => { setLocale(l.id); }}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-4 transition",
              locale === l.id ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20"
            )}
          >
            <span className="text-3xl">{l.flag}</span>
            <div className="flex-1">
              <p className="text-sm font-medium">{l.label}</p>
              <p className="text-[11px] text-muted-foreground">{l.id === "en" ? "English" : "Tiếng Việt"}</p>
            </div>
            {locale === l.id && <Check className="h-4 w-4 text-emerald-400" />}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

/* ---------- Accessibility Settings Card ---------- */
function AccessibilitySettingsCard() {
  const { t } = useT();
  const { fontSize, reducedMotion, highContrast, colorBlind, setFontSize, setReducedMotion, setHighContrast, setColorBlind } = usePersonalizationStore();

  const fontSizes: { id: FontSize; label: string }[] = [
    { id: "sm", label: t("settings", "accessibility.fontSm") },
    { id: "base", label: t("settings", "accessibility.fontBase") },
    { id: "lg", label: t("settings", "accessibility.fontLg") },
  ];

  const cbModes: { id: ColorBlindMode; label: string }[] = [
    { id: "none", label: t("settings", "accessibility.cbNone") },
    { id: "protanopia", label: t("settings", "accessibility.cbProtanopia") },
    { id: "deuteranopia", label: t("settings", "accessibility.cbDeuteranopia") },
    { id: "tritanopia", label: t("settings", "accessibility.cbTritanopia") },
  ];

  return (
    <>
      <GlassCard strong className="p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4 text-cyan-300" /> {t("settings", "accessibility.title")}</h3>
        
        {/* Font size */}
        <div className="mt-4">
          <label className="text-xs font-medium text-muted-foreground">{t("settings", "accessibility.fontSize")}</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {fontSizes.map((f) => (
              <button
                key={f.id}
                onClick={() => { setFontSize(f.id); }}
                className={cn(
                  "rounded-lg border py-2 text-sm transition",
                  fontSize === f.id ? "border-cyan-400/40 bg-cyan-400/[0.06] text-foreground" : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground"
                )}
                style={{ fontSize: f.id === "sm" ? "13px" : f.id === "lg" ? "18px" : "16px" }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <NeonDivider className="my-4" />

        {/* Toggles */}
        <div className="space-y-3">
          <ToggleRow
            label={t("settings", "accessibility.reducedMotion")}
            desc={t("settings", "reducedMotionDesc")}
            checked={reducedMotion}
            onCheckedChange={(v) => { setReducedMotion(v); toast.success(v ? t("notifications", "reducedMotionOn") : t("notifications", "reducedMotionOff")); }}
          />
          <ToggleRow
            label={t("settings", "accessibility.highContrast")}
            desc="Cải thiện độ tương phản đường viền và chữ." // Technical UI term
            checked={highContrast}
            onCheckedChange={(v) => { setHighContrast(v); toast.success(v ? t("notifications", "highContrastOn") : t("notifications", "highContrastOff")); }}
          />
        </div>

        <NeonDivider className="my-4" />

        {/* Color blind mode */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t("settings", "accessibility.colorBlindMode")}</label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cbModes.map((c) => (
              <button
                key={c.id}
                onClick={() => { setColorBlind(c.id); }}
                className={cn(
                  "rounded-lg border py-2 text-xs transition",
                  colorBlind === c.id ? "border-cyan-400/40 bg-cyan-400/[0.06] text-foreground" : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Applies an SVG color-correction filter to the whole app.</p>
        </div>
      </GlassCard>
    </>
  );
}