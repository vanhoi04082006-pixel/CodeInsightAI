"use client";

import { useEffect, useState } from "react";
import {
  Users, Search, Ban, Trash2, Loader2,
} from "lucide-react";
import { GlassCard } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/views/admin-view";

type AdminUser = {
  id: string; name: string | null; email: string | null; image: string | null;
  plan: string; role: string; banned: boolean; createdAt: string; updatedAt: string;
  _count: { analyses: number; credentials: number; usageRecords: number };
};

export function UsersTab() {
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

