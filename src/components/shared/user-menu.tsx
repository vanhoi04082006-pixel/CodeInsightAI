"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, User as UserIcon, Crown, ChevronDown, Loader2, ShieldCheck, Shield } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAppStore } from "@/lib/store";
import { useUpgrade } from "@/hooks/use-upgrade";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

/**
 * User menu shown in the topbar.
 * - Shows avatar (image or initials fallback) + name + plan badge
 * - Dropdown: profile, settings, upgrade (if free), logout
 * - Logout: AlertDialog confirmation → signOut → toast
 *
 * The fallback avatar uses initials derived from the user's name/email so
 * there is never a hydration mismatch (no random values, no Date.now()).
 */
export function UserMenu() {
  const { t } = useT();
  const { data: session, status } = useSession();
  const setView = useAppStore((s) => s.setView);
  const { upgrade } = useUpgrade();
  const [signingOut, setSigningOut] = useState(false);

  if (status === "loading") {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status !== "authenticated" || !session?.user) {
    // Not authenticated — render nothing; the auth gate will handle login UI.
    return null;
  }

  const name = session.user.name ?? session.user.email ?? t("common", "userMenu.userFallback");
  const email = session.user.email ?? "";
  const image = session.user.image ?? null;
  const plan = (session as any).plan ?? "free";
  const role = (session as any).role ?? "user";
  const isAdmin = role === "admin";
  const initials = getInitials(name);

  const handleLogout = async () => {
    setSigningOut(true);
    toast.loading(t("common", "userMenu.signOutToastLoading"), { id: "signout" });
    try {
      await signOut({ callbackUrl: "/", redirect: true });
      toast.success(t("common", "userMenu.signOutToastSuccess"));
    } catch {
      toast.error(t("common", "userMenu.signOutToastError"));
    } finally {
      setSigningOut(false);
      toast.dismiss("signout");
    }
  };

  return (
    <AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-1 pr-2 text-left transition hover:bg-white/[0.06]"
            aria-label={t("common", "userMenu.ariaLabel")}
          >
            {image ? (
              <img
                src={image}
                alt={name}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/40 to-violet-500/40 text-[10px] font-bold uppercase">
                {initials}
              </div>
            )}
            <div className="hidden min-w-0 sm:block">
              <div className="flex items-center gap-1.5 text-xs font-medium leading-tight">
                <span className="max-w-[120px] truncate">{name.split(" ")[0]}</span>
                {isAdmin ? (
                  <Shield className="h-3 w-3 text-cyan-300" />
                ) : plan !== "free" ? (
                  <Crown className="h-3 w-3 text-amber-400" />
                ) : null}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {isAdmin ? t("common", "userMenu.adminBadge") : t("common", "userMenu.planSuffix", { plan })}
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 border-white/10 bg-popover/95 backdrop-blur-2xl">
          <DropdownMenuLabel className="flex items-center gap-3 py-2">
            {image ? (
              <img src={image} alt={name} className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/40 to-violet-500/40 text-[11px] font-bold uppercase">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setView("settings")} className="cursor-pointer">
            <UserIcon className="mr-2 h-4 w-4" /> {t("common", "userMenu.profileSettings")}
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem onClick={() => setView("admin")} className="cursor-pointer text-cyan-300">
              <Shield className="mr-2 h-4 w-4" /> {t("common", "userMenu.adminDashboard")}
            </DropdownMenuItem>
          )}
          {!isAdmin && plan === "free" && (
            <DropdownMenuItem
              onClick={() => upgrade("pro")}
              className="cursor-pointer text-amber-300"
            >
              <Crown className="mr-2 h-4 w-4" /> {t("common", "userMenu.upgradeToPro")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              className="cursor-pointer text-rose-300 focus:text-rose-200"
              onSelect={(e) => e.preventDefault()}
            >
              <LogOut className="mr-2 h-4 w-4" /> {t("common", "userMenu.signOut")}
            </DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent className="border-white/10 bg-popover/95 backdrop-blur-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            {t("common", "userMenu.signOutTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("common", "userMenu.signOutDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={signingOut}>{t("common", "actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleLogout}
            disabled={signingOut}
            className="bg-rose-500 text-white hover:bg-rose-600"
          >
            {signingOut ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {t("common", "userMenu.signingOut")}
              </>
            ) : (
              <>
                <LogOut className="mr-1.5 h-4 w-4" /> {t("common", "userMenu.signOut")}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Derive 1-2 initials from a name or email — pure function, no Date/random. */
function getInitials(input: string): string {
  if (!input) return "U";
  const cleaned = input.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  if (!cleaned) return "U";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}
