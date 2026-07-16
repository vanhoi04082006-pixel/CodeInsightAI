"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeManager } from "@/components/shared/theme-manager";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      })
  );
  // No client-only i18n init — the cookie + inline script handle SSR-safe
  // language detection. The ThemeManager applies personalization changes
  // after mount (the inline script already applied the initial state).
  return (
    <QueryClientProvider client={client}>
      <ThemeManager />
      {children}
    </QueryClientProvider>
  );
}
