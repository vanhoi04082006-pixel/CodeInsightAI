"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ThemeManager } from "@/components/shared/theme-manager";
import { useI18nStore, type Locale } from "@/lib/i18n";
import { SessionProvider } from "next-auth/react"; // <-- Import SessionProvider

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

  // Set the locale SYNCHRONOUSLY during render (via useMemo, which runs
  // before children render). This overrides the default "en" with the
  // server-read cookie value. Both server and client get the same value
  // from the same cookie, so no hydration mismatch.
  useMemo(() => {
    useI18nStore.setState({ locale: initialLocale });
  }, [initialLocale]);

  return (
    <SessionProvider>
      <QueryClientProvider client={client}>
        <ThemeManager />
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}