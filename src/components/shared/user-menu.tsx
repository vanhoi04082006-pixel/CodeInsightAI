"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, User as UserIcon, Crown, ChevronDown, Loader2, ShieldCheck } from "lucide-react";
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
  const { data: session, status } = useSession();
  const setView = useAppStore((s) => s.setView);
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

  const name = session.user.name ?? session.user.email ?? "User";
  const email = session.user.email ?? "";
  const image = session.user.image ?? null;
  const plan = (session as any).plan ?? "free";
  const initials = getInitials(name);

  const handleLogout = async () => {
    setSigningOut(true);
    toast.loading("Signing out…", { id: "signout" });
    try {
      await signOut({ callbackUrl: "/", redirect: true });
      toast.success("Signed out successfully");
    } catch {
      toast.error("Failed to sign out");
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
            aria-label="User menu"
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
                {plan !== "free" && (
                  <Crown className="h-3 w-3 text-amber-400" />
                )}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {plan} plan
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
            <UserIcon className="mr-2 h-4 w-4" /> Profile & Settings
          </DropdownMenuItem>
          {plan === "free" && (
            <DropdownMenuItem onClick={() => setView("settings")} className="cursor-pointer text-amber-300">
              <Crown className="mr-2 h-4 w-4" /> Upgrade to Pro
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              className="cursor-pointer text-rose-300 focus:text-rose-200"
              onSelect={(e) => e.preventDefault()}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent className="border-white/10 bg-popover/95 backdrop-blur-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            Sign out of CodeInsight AI?
          </AlertDialogTitle>
          <AlertDialogDescription>
            You will be returned to the landing page. Your settings and API keys are saved securely and
            will be available when you sign back in with GitHub.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={signingOut}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleLogout}
            disabled={signingOut}
            className="bg-rose-500 text-white hover:bg-rose-600"
          >
            {signingOut ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Signing out…
              </>
            ) : (
              <>
                <LogOut className="mr-1.5 h-4 w-4" /> Sign out
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
