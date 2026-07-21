"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

/**
 * useUpgrade — hook for upgrading to Pro via Stripe checkout.
 * Calls /api/billing/checkout with the given plan and redirects to the
 * Stripe-hosted checkout page. Handles loading state + error toasts.
 *
 * Usage:
 *   const { upgrade, loading } = useUpgrade();
 *   <button onClick={() => upgrade("pro")}>Upgrade to Pro</button>
 */
export function useUpgrade() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  const plan = (session as any)?.plan ?? "free";
  const role = (session as any)?.role ?? "user";
  const canUpgrade = plan === "free" && role !== "admin";

  const upgrade = async (targetPlan: "pro" | "team" = "pro") => {
    if (loading) return;
    if (!canUpgrade) {
      toast.info(role === "admin" ? "Admin accounts already have all features." : "You're already on a paid plan.");
      return;
    }
    setLoading(true);
    toast.loading("Redirecting to Stripe checkout…", { id: "stripe-redirect" });
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: targetPlan }),
      });
      const data = await res.json();
      if (data.url) {
        toast.success("Redirecting to checkout…", { id: "stripe-redirect" });
        window.location.href = data.url;
      } else {
        toast.dismiss("stripe-redirect");
        toast.error(data.error || "Stripe is not configured yet. Please try again later.");
      }
    } catch (e) {
      toast.dismiss("stripe-redirect");
      toast.error("Failed to start checkout — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return { upgrade, loading, plan, role, canUpgrade };
}
