"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useProvidersStore } from "@/lib/providers-store";
import { useI18nStore } from "@/lib/i18n";

const AUTH_ERROR_KEYS: Record<string, string> = {
  OAuthSignin: "OAuthSignin",
  OAuthCallback: "OAuthCallback",
  OAuthCreateAccount: "OAuthCreateAccount",
  EmailCreateAccount: "EmailCreateAccount",
  Callback: "Callback",
  AccessDenied: "AccessDenied",
  Configuration: "Configuration",
  Verification: "Verification",
};

/**
 * Watches the NextAuth session and fires toasts on state transitions:
 * - On mount: surface any `?error=…` from the URL (OAuth redirect errors).
 * - loading → authenticated: "Signed in as …" + sync providers from backend.
 *
 * Mounted once at the app root (in providers.tsx) so every page gets the
 * toast feedback. Pure observer — no UI output.
 */
export function AuthStateWatcher() {
  const { status, data: session } = useSession();
  const prevStatus = useRef<string | null>(null);
  const errorHandledRef = useRef(false);
  const syncFromBackend = useProvidersStore((s) => s.syncFromBackend);
  const t = useI18nStore((s) => s.t);

  // Surface OAuth redirect errors once on mount (e.g. ?error=OAuthCallback).
  // We use a small delay to ensure the Sonner <Toaster> has mounted first —
  // otherwise the toast() call may fire before the Toaster subscribes and
  // the toast silently disappears.
  useEffect(() => {
    if (errorHandledRef.current) return;
    errorHandledRef.current = true;
    const fire = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const error = params.get("error");
        if (error) {
          const errorKey = AUTH_ERROR_KEYS[error] ?? "default";
          const message = t("common", `auth.errors.${errorKey}`) === `auth.errors.${errorKey}`
            ? t("common", "auth.errors.prefix", { error })
            : t("common", `auth.errors.${errorKey}`);
          toast.error(message, { duration: 8000 });
          // Clean the URL so the toast doesn't reappear on refresh / share
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {
        console.error("[AuthStateWatcher] error handling failed", e);
      }
    };
    // Two RAFs ensure the Toaster is mounted + subscribed before we fire.
    requestAnimationFrame(() => requestAnimationFrame(fire));
  }, []);

  useEffect(() => {
    if (prevStatus.current === null) {
      // First run — just record the initial status, don't toast
      prevStatus.current = status;
      return;
    }
    if (prevStatus.current === "loading" && status === "authenticated" && session?.user) {
      const name = session.user.name ?? session.user.email ?? t("common", "userMenu.userFallback");
      toast.success(t("common", "auth.signedInAs", { name }));

      // After sign-in, sync providers from the backend (encrypted credentials,
      // masked keys — no raw API key in browser localStorage).
      syncFromBackend().catch(() => { /* silent */ });
    }
    prevStatus.current = status;
  }, [status, session, syncFromBackend]);

  return null;
}
