"use client";

import { useEffect, useState } from "react";

/**
 * HydrationGuard
 *
 * Prevents hydration mismatch errors caused by browser extensions (Bitdefender,
 * Avast, password managers) that inject attributes like `fdprocessedid`,
 * `data-bitdefender`, etc. into interactive elements before React hydrates.
 *
 * Strategy: render children only after the client has mounted. On the server
 * and during the first client pass, render a lightweight placeholder. Once
 * mounted, render the real children. This guarantees the server HTML and the
 * first client render are identical (empty), avoiding any mismatch.
 *
 * The trade-off is a one-frame delay on first paint, but it eliminates all
 * hydration warnings from third-party DOM mutations.
 */
export function HydrationGuard({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Canonical mount guard for client-only rendering (avoids hydration mismatch
    // from browser extensions that mutate the DOM before React hydrates).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  return <>{mounted ? children : fallback}</>;
}
