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
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="overview" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Overview</span></TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Users</span></TabsTrigger>
          <TabsTrigger value="platform-ai" className="gap-1.5"><Cpu className="h-3.5 w-3.5" /> <span className="hidden sm:inline">AI Config</span></TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-1.5"><Crown className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Subs</span></TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><ScrollText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Audit</span></TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5"><Server className="h-3.5 w-3.5" /> <span className="hidden sm:inline">System</span></TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="platform-ai" className="mt-4"><PlatformAITab /></TabsContent>
        <TabsContent value="subscriptions" className="mt-4"><SubscriptionsTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
        <TabsContent value="system" className="mt-4"><SystemTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Overview Tab ---------- */
function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => toast.error("Failed to load stats"))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return <LoadingCard />;
  }

  const cards = [
    { label: "Total Users", value: stats.totals.users, icon: Users, color: "#22d3ee", sub: `${stats.totals.proUsers} Pro · ${stats.totals.teamUsers} Team` },
    { label: "Total Analyses", value: stats.totals.analyses, icon: Activity, color: "#a78bfa", sub: `${stats.totals.chatMessages} chat msgs` },
    { label: "Active Subs", value: stats.totals.activeSubs, icon: Crown, color: "#fbbf24", sub: `$${stats.totals.mrr}/mo MRR` },
    { label: "MRR", value: `$${stats.totals.mrr}`, icon: DollarSign, color: "#34d399", sub: `$${stats.totals.mrr * 12}/yr ARR` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <GlassCard key={c.label} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${c.color}1a`, color: c.color, border: `1px solid ${c.color}33` }}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: c.color }}>{c.value}</p>
              {c.sub && <p className="text-[10px] text-muted-foreground">{c.sub}</p>}
            </GlassCard>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-cyan-300" /> Analyses (30 days)</h3>
          <MiniChart data={stats.trends.analyses} color="#22d3ee" />
        </GlassCard>
        <GlassCard className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-violet-300" /> New Users (30 days)</h3>
          <MiniChart data={stats.trends.users} color="#a78bfa" />
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <h3 className="text-sm font-semibold">Recent Signups</h3>
        <div className="mt-3 space-y-2">
          {stats.recentSignups.length === 0 ? (
            <p className="text-xs text-muted-foreground">No signups yet.</p>
          ) : (
            stats.recentSignups.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-2">
                <Avatar name={u.name ?? u.email ?? "?"} image={u.image} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.name ?? "Unknown"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{u.plan}</Badge>
                <span className="text-[10px] text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}

/* ---------- Users Tab ---------- */
function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset), q, plan: planFilter });
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [offset, planFilter]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]);

  const updateUser = async (id: string, patch: { plan?: string; role?: string; banned?: boolean }) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (data.user) {
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
        toast.success("User updated");
      } else {
        toast.error(data.error || "Failed to update user");
      }
    } catch {
      toast.error("Failed to update user");
    }
  };

  const deleteUser = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setUsers((prev) => prev.filter((u) => u.id !== id));
        setTotal((t) => t - 1);
        toast.success("User deleted");
      } else {
        toast.error(data.error || "Failed to delete user");
      }
    } catch {
      toast.error("Failed to delete user");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email…" className="pl-9 bg-white/[0.03]" />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-white/[0.03]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="team">Team</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="p-8"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No users found.</div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">User</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Role</th>
                  <th className="p-3 text-center">Analyses</th>
                  <th className="p-3">Joined</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={cn("border-b border-white/5 last:border-b-0", u.banned && "opacity-50")}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name ?? u.email ?? "?"} image={u.image} size={28} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{u.name ?? "Unknown"}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Select value={u.plan} onValueChange={(v) => updateUser(u.id, { plan: v })}>
                        <SelectTrigger className="h-7 w-20 border-white/10 bg-white/[0.03] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="team">Team</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      {u.role === "admin" ? (
                        <Badge className="bg-cyan-500/15 text-cyan-300">Admin</Badge>
                      ) : u.banned ? (
                        <Badge className="bg-rose-500/15 text-rose-300">Banned</Badge>
                      ) : (
                        <Badge variant="outline">User</Badge>
                      )}
                    </td>
                    <td className="p-3 text-center tabular-nums">{u._count.analyses}</td>
                    <td className="p-3 text-[11px] text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => updateUser(u.id, { banned: !u.banned })} title={u.banned ? "Unban" : "Ban"}>
                          <Ban className={cn("h-3.5 w-3.5", u.banned && "text-rose-400")} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-rose-300" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="border-white/10 bg-popover/95 backdrop-blur-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {u.name ?? u.email}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the user and ALL their data (analyses, chat messages, credentials, settings). This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteUser(u.id)} className="bg-rose-500 text-white hover:bg-rose-600">
                                Delete permanently
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {total > limit && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={offset + limit >= total} onClick={() => setOffset((o) => o + limit)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Subscriptions Tab ---------- */
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
function LoadingCard() {
  return (
    <GlassCard className="p-12">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
    </GlassCard>
  );
}

function Avatar({ name, image, size = 32 }: { name: string; image?: string | null; size?: number }) {
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
function PlatformAITab() {
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
  const [testing, setTesting] = useState<string | null>(null); // providerId being tested
  const [testResults, setTestResults] = useState<Record<string, { status: "ok" | "error" | "testing"; latency?: number; error?: string }>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/platform-ai");
      const data = await res.json();
      setConfigured(data.configured || []);
      setAvailable(data.available || []);
    } catch {
      toast.error("Failed to load Platform AI config");
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
        toast.success(`${editProviderId} saved`);
        setShowAddForm(false);
        setEditApiKey("");
        load();
      } else {
        toast.error(data.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (providerId: string) => {
    if (!confirm(`Remove ${providerId} from Platform AI?`)) return;
    try {
      await fetch(`/api/admin/platform-ai?providerId=${providerId}`, { method: "DELETE" });
      toast.success(`${providerId} removed`);
      load();
    } catch {
      toast.error("Failed to remove");
    }
  };

  // Test API key connectivity — calls /api/providers/test with admin's key
  const handleTestKey = async (providerId: string, apiKey?: string, baseUrl?: string, model?: string) => {
    setTesting(providerId);
    setTestResults((prev) => ({ ...prev, [providerId]: { status: "testing" } }));
    try {
      // If no apiKey provided, fetch from DB (admin already saved it)
      let keyToTest = apiKey;
      if (!keyToTest) {
        // Read from DB via admin API
        const configRes = await fetch("/api/admin/platform-ai");
        const configData = await configRes.json();
        const config = configData.configured?.find((c: any) => c.providerId === providerId);
        if (config?.maskedKey && config.maskedKey !== "••••") {
          // Key exists in DB — use the admin API to test it (server decrypts)
          // We can't send the masked key to /api/providers/test — so we call
          // a special admin test endpoint that decrypts server-side
          const testRes = await fetch("/api/admin/platform-ai/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId }),
          });
          const testData = await testRes.json();
          setTestResults((prev) => ({
            ...prev,
            [providerId]: testData.status === "connected"
              ? { status: "ok", latency: testData.latencyMs }
              : { status: "error", error: testData.error },
          }));
          return;
        }
      }

      // If we have a raw key (from edit form), test it directly
      const models = editModels.length > 0 ? editModels : [];
      const testRes = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          apiKey: keyToTest,
          baseUrl: baseUrl || editBaseUrl,
          model: model || models[0] || "",
        }),
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
        [providerId]: { status: "error", error: "Network error" },
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
            <h3 className="text-sm font-semibold"><GradientText>Platform AI Providers</GradientText></h3>
          </div>
          <Badge variant="outline" className="text-[10px]">{configured.length} configured</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure MULTIPLE AI providers with API keys. Pro users can then choose which provider + model to use.
          Free users use their own BYOK keys.
        </p>

        {/* Configured providers list */}
        {configured.length === 0 ? (
          <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-4 text-center">
            <p className="text-sm text-rose-300">No Platform AI providers configured yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">Add at least one provider below so Pro users can use Platform AI.</p>
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
                        {c.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      {/* Test status badge */}
                      {testResult?.status === "ok" && (
                        <Badge className="bg-emerald-500/15 text-emerald-300">
                          <CheckCircle2 className="mr-1 h-2.5 w-2.5" /> {testResult.latency}ms
                        </Badge>
                      )}
                      {testResult?.status === "error" && (
                        <Badge className="bg-rose-500/15 text-rose-300">
                          <AlertCircle className="mr-1 h-2.5 w-2.5" /> Error
                        </Badge>
                      )}
                      {testResult?.status === "testing" && (
                        <Badge className="bg-amber-500/15 text-amber-300">
                          <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> Testing…
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {c.models.length} models · Key: <span className="font-mono">{c.maskedKey}</span>
                      {testResult?.error && <span className="text-rose-400"> · {testResult.error.slice(0, 60)}</span>}
                    </p>
                  </div>
                  {/* Test Key button */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTestKey(c.providerId)}
                    disabled={testing === c.providerId}
                    className="border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10"
                  >
                    {testing === c.providerId ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1 h-3.5 w-3.5" />}
                    Test
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(c)} title="Edit">
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => handleDelete(c.providerId)} title="Remove">
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
              <SelectTrigger className="bg-white/[0.03]"><SelectValue placeholder="+ Add provider…" /></SelectTrigger>
              <SelectContent>
                {available.map((p) => (
                  <SelectItem key={p.providerId} value={p.providerId}>
                    {p.name} ({p.category}) — {p.models.length} models
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
                {configured.find((c) => c.providerId === editProviderId) ? "Edit" : "Add"} {editProviderId}
              </p>
              <button onClick={() => setShowAddForm(false)} className="text-xs text-muted-foreground hover:text-foreground">✕ Cancel</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-muted-foreground">API Key</label>
                <Input
                  type="password"
                  value={editApiKey}
                  onChange={(e) => setEditApiKey(e.target.value)}
                  placeholder={configured.find((c) => c.providerId === editProviderId) ? "•••• (saved — type new to replace)" : "sk-..."}
                  className="bg-white/[0.03] font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-muted-foreground">Base URL</label>
                <Input value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} className="bg-white/[0.03] font-mono text-xs" />
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <label className="text-[10px] uppercase text-muted-foreground">Available Models ({editModels.length})</label>
              <div className="flex flex-wrap gap-1">
                {editModels.map((m) => (
                  <span key={m} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-mono">{m}</span>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={handleSave} disabled={saving} size="sm" className="bg-gradient-to-r from-cyan-500 to-violet-500 text-white">
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                {saving ? "Saving…" : "Save Provider"}
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={editEnabled} onChange={(e) => setEditEnabled(e.target.checked)} className="rounded" />
                Enabled
              </label>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
