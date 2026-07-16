"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ThemeManager } from "@/components/shared/theme-manager";
import { useI18nStore } from "@/lib/i18n";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      })
  );
  // Auto-detect browser language on first launch
  const initFromBrowser = useI18nStore((s) => s.initFromBrowser);
  useEffect(() => {
    initFromBrowser();
  }, [initFromBrowser]);

  return (
    <QueryClientProvider client={client}>
      <ThemeManager />
      {children}
    </QueryClientProvider>
  );
}
