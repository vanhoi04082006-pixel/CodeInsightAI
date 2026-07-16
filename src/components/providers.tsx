"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeManager } from "@/components/shared/theme-manager";
import { setInitialLocale, type Locale } from "@/lib/i18n";

export function Providers({
  children,
  initialLocale = "en",
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      })
  );

  // Set the module-level locale BEFORE the store is read by any component.
  // On the server: this sets the locale from the cookie read via next/headers.
  // On the client: the store already read document.cookie during creation,
  // so this is a no-op (both are the same value from the same cookie).
  //
  // This is NOT a setState call — it's a plain module-level variable.
  // No React state update, no re-render, no hydration mismatch.
  setInitialLocale(initialLocale);

  return (
    <QueryClientProvider client={client}>
      <ThemeManager />
      {children}
    </QueryClientProvider>
  );
}
