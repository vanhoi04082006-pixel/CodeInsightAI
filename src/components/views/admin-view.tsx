"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Activity,
  DollarSign,
  Crown,
  Shield,
  Search,
  Ban,
  Trash2,
  TrendingUp,
  Loader2,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  ScrollText,
  Server,
  Cpu,
  Settings2,
  Check,
  Zap,
} from "lucide-react";
import { GlassCard, GradientText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Stats = {
  totals: {
    users: number;
    analyses: number;
    chatMessages: number;
    proUsers: number;
    teamUsers: number;
    activeSubs: number;
    mrr: number;
  };
  recentSignups: Array<{ id: string; name: string | null; email: string | null; image: string | null; plan: string; createdAt: string }>;
  trends: {
    analyses: Array<{ date: string; count: number }>;
    users: Array<{ date: string; count: number }>;
  };
};

type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  plan: string;
  role: string;
  banned: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { analyses: number; credentials: number; usageRecords: number };
};

type Subscriber = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  plan: string;
  stripeCustomerId: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { analyses: number };
};

type AuditEntry = {
  id: string;
  adminId: string;
  action: string;
  targetId: string | null;
  details: string;
  createdAt: string;
  admin: { id: string; name: string | null; email: string | null; image: string | null };
};

export function AdminView() {
  const { data: session } = useSession();
  const role = (session as any)?.role ?? "user";
  const isAdmin = role === "admin";

  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <GlassCard className="p-10">
          <Shield className="mx-auto h-10 w-10 text-rose-400" />
          <h2 className="mt-4 text-xl font-bold">Admin Access Required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You don&apos;t have permission to view this page. Only admin accounts can access the admin dashboard.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4 text-cyan-300" />
          <span>Admin Dashboard</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">
          <GradientText>Admin Console</GradientText>
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage users, monitor usage, and oversee the platform.
        </p>
      </motion.div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-6">
          <TabsTrigger value="overview" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Overview</span></TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Users</span></TabsTrigger>
          <TabsTrigger value="platform-ai" className="gap-1.5"><Cpu className="h-3.5 w-3.5" /> <span className="hidden sm:inline">AI Config</span></TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-1.5"><Crown className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Subs</span></TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><ScrollText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Audit</span></TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5"><Server className="h-3.5 w-3.5" /> <span className="hidden sm:inline">System</span></TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><AdminOverview /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="platform-ai" className="mt-4"><PlatformAITab /></TabsContent>
        <TabsContent value="subscriptions" className="mt-4"><SubscriptionsTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
        <TabsContent value="system" className="mt-4"><SystemTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Overview Tab (moved to admin-overview.tsx) ---------- */

/* ---------- Users Tab ---------- */
function SubscriptionsTab() {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [mrr, setMrr] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/subscriptions")
      .then((r) => r.json())
      .then((d) => { setSubs(d.subscribers || []); setMrr(d.mrr || 0); })
      .catch(() => toast.error("Failed to load subscriptions"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <GlassCard className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Subscribers</p>
          <p className="mt-1 text-2xl font-bold text-amber-300">{subs.length}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">MRR</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">${mrr}/mo</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">ARR (est.)</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">${mrr * 12}/yr</p>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden">
        {subs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No paid subscribers yet.</div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Subscriber</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Stripe Customer</th>
                  <th className="p-3 text-center">Analyses</th>
                  <th className="p-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-b border-white/5 last:border-b-0">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={s.name ?? s.email ?? "?"} image={s.image} size={28} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{s.name ?? "Unknown"}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge className={cn(
                        s.plan === "pro" && "bg-violet-500/15 text-violet-300",
                        s.plan === "team" && "bg-cyan-500/15 text-cyan-300",
                        s.plan === "enterprise" && "bg-amber-500/15 text-amber-300",
                      )}>
                        {s.plan}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-[10px] text-muted-foreground">{s.stripeCustomerId ? s.stripeCustomerId.slice(0, 20) + "…" : "—"}</td>
                    <td className="p-3 text-center tabular-nums">{s._count.analyses}</td>
                    <td className="p-3 text-[11px] text-muted-foreground">{new Date(s.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

/* ---------- Audit Tab ---------- */
function AuditTab() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/audit?limit=100")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []))
      .catch(() => toast.error("Failed to load audit log"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCard />;

  return (
    <GlassCard className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ScrollText className="h-4 w-4 text-cyan-300" /> Admin Actions</h3>
      {logs.length === 0 ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">No admin actions recorded yet.</p>
      ) : (
        <div className="mt-3 space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10">
                {getActionIcon(log.action)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{log.admin.name ?? log.admin.email ?? "Admin"}</span>{" "}
                  <span className="text-muted-foreground">{formatAction(log.action)}</span>
                </p>
                {log.targetId && (
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">target: {log.targetId}</p>
                )}
                {log.details && log.details !== "{}" && (
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">{log.details}</p>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

/* ---------- System Tab ---------- */
function SystemTab() {
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-cyan-300" /> System Health</h3>
        {health ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <HealthItem label="Status" value={health.status} ok={health.status === "healthy"} />
            <HealthItem label="Database" value={health.services?.database} ok={health.services?.database === "ok"} />
            <HealthItem label="Job Queue" value={health.services?.jobQueue} ok={health.services?.jobQueue === "ok"} />
            <HealthItem label="Uptime" value={`${health.stats?.uptime ?? 0}s`} />
            <HealthItem label="Memory" value={health.stats?.memory ? `${health.stats.memory.used} / ${health.stats.memory.total}` : "—"} />
            <HealthItem label="Analyses" value={health.stats?.analyses ?? 0} />
          </div>
        ) : (
          <div className="mt-3"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h3 className="text-sm font-semibold">Environment</h3>
        {health?.env ? (
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <EnvItem label="NODE_ENV" value={health.env.nodeEnv} />
            <EnvItem label="APP_ENV" value={health.env.appEnv} />
            <EnvItem label="DATABASE_URL" value={health.env.databaseUrlProtocol + "://…"} ok={health.env.databaseUrlProtocol === "postgresql"} />
            <EnvItem label="NEXTAUTH_URL" value={health.env.nextAuthUrl} />
            <EnvItem label="GITHUB_ID" value={health.env.hasGithubId ? "set" : "missing"} ok={health.env.hasGithubId} />
            <EnvItem label="GITHUB_SECRET" value={health.env.hasGithubSecret ? "set" : "missing"} ok={health.env.hasGithubSecret} />
            <EnvItem label="NEXTAUTH_SECRET" value={health.env.hasNextAuthSecret ? "set" : "missing"} ok={health.env.hasNextAuthSecret} />
            <EnvItem label="PLATFORM_AI_API_KEY" value={health.env.hasPlatformAiKey ? "set" : "missing"} ok={health.env.hasPlatformAiKey} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
        )}
      </GlassCard>
    </div>
  );
}

/* ---------- Helpers ---------- */
export function LoadingCard() {
  return (
    <GlassCard className="p-12">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
    </GlassCard>
  );
}

export function Avatar({ name, image, size = 32 }: { name: string; image?: string | null; size?: number }) {
  const initials = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  if (image) {
    return <img src={image} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover" />;
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.35 }} className="flex items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/40 to-violet-500/40 font-bold uppercase">
      {initials}
    </div>
  );
}

function MiniChart({ data, color }: { data: Array<{ date: string; count: number }>; color: string }) {
  if (data.length === 0) {
    return <p className="mt-4 text-xs text-muted-foreground">No data yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="mt-4 flex h-32 items-end gap-0.5">
      {data.map((d) => (
        <div
          key={d.date}
          className="flex-1 rounded-t transition-all hover:opacity-80"
          style={{ height: `${(d.count / max) * 100}%`, background: color, minHeight: "2px", opacity: 0.7 }}
          title={`${d.date}: ${d.count}`}
        />
      ))}
    </div>
  );
}

function HealthItem({ label, value, ok }: { label: string; value: any; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {ok === true && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
        {ok === false && <AlertCircle className="h-3 w-3 text-rose-400" />}
        <span className={ok === false ? "text-rose-300" : ""}>{String(value)}</span>
      </span>
    </div>
  );
}

function EnvItem({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-mono text-[11px]">
        {ok === true && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
        {ok === false && <AlertCircle className="h-3 w-3 text-rose-400" />}
        <span className={ok === false ? "text-rose-300" : "text-foreground"}>{value}</span>
      </span>
    </div>
  );
}

function getActionIcon(action: string) {
  if (action.includes("ban")) return <Ban className="h-3.5 w-3.5 text-rose-400" />;
  if (action.includes("delete")) return <Trash2 className="h-3.5 w-3.5 text-rose-400" />;
  if (action.includes("upgrade")) return <Crown className="h-3.5 w-3.5 text-amber-300" />;
  return <ChevronRight className="h-3.5 w-3.5 text-cyan-300" />;
}

function formatAction(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}


/* ---------- Platform AI Config Tab (Multi-Provider) ---------- */

// Extracted tabs — imported from separate files for maintainability

// Extracted tabs — imported from separate files
import { UsersTab } from "@/components/admin-tabs/users-tab";
import { PlatformAITab } from "@/components/admin-tabs/platform-ai-tab";
import { AdminOverview } from "@/components/admin-tabs/admin-overview";
