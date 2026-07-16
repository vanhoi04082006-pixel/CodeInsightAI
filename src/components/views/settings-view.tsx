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
} from "lucide-react";
import { GlassCard, GradientText, NeonDivider } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAppStore } from "@/lib/store";
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
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="account" className="gap-1.5"><User className="h-3.5 w-3.5" /> Account</TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5"><Cpu className="h-3.5 w-3.5" /> AI</TabsTrigger>
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
