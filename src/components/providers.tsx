"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeManager } from "@/components/shared/theme-manager";
import { useI18nStore, type Locale } from "@/lib/i18n";

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

  // Set the locale SYNCHRONOUSLY before first render — no useEffect, no flash.
  // The initialLocale comes from the server-read cookie, so server and client
  // render the SAME language. No hydration mismatch.
  useI18nStore.setState({ locale: initialLocale });

  return (
    <QueryClientProvider client={client}>
      <ThemeManager />
      {children}
    </QueryClientProvider>
  );
}
