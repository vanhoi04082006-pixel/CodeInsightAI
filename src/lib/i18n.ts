"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Locale = "en" | "vi";

// Locale messages — statically imported so they're available on both server and client.
import enCommon from "../../locales/en/common.json";
import enSettings from "../../locales/en/settings.json";
import enDashboard from "../../locales/en/dashboard.json";
import enAnalysis from "../../locales/en/analysis.json";
import enLanding from "../../locales/en/landing.json";
import enReports from "../../locales/en/reports.json";
import enErrors from "../../locales/en/errors.json";
import enProviders from "../../locales/en/providers.json";
import enPersonality from "../../locales/en/personality.json";
import enDeveloper from "../../locales/en/developer.json";
import enHistory from "../../locales/en/history.json";
import enChat from "../../locales/en/chat.json";
import enNotifications from "../../locales/en/notifications.json";

import viCommon from "../../locales/vi/common.json";
import viSettings from "../../locales/vi/settings.json";
import viDashboard from "../../locales/vi/dashboard.json";
import viAnalysis from "../../locales/vi/analysis.json";
import viLanding from "../../locales/vi/landing.json";
import viReports from "../../locales/vi/reports.json";
import viErrors from "../../locales/vi/errors.json";
import viProviders from "../../locales/vi/providers.json";
import viPersonality from "../../locales/vi/personality.json";
import viDeveloper from "../../locales/vi/developer.json";
import viHistory from "../../locales/vi/history.json";
import viChat from "../../locales/vi/chat.json";
import viNotifications from "../../locales/vi/notifications.json";

type Dict = Record<string, unknown>;

export const DICTS: Record<Locale, Record<string, Dict>> = {
  en: {
    common: enCommon, settings: enSettings, dashboard: enDashboard,
    analysis: enAnalysis, landing: enLanding, reports: enReports, errors: enErrors,
    providers: enProviders, personality: enPersonality, developer: enDeveloper,
    history: enHistory, chat: enChat, notifications: enNotifications,
  },
  vi: {
    common: viCommon, settings: viSettings, dashboard: viDashboard,
    analysis: viAnalysis, landing: viLanding, reports: viReports, errors: viErrors,
    providers: viProviders, personality: viPersonality, developer: viDeveloper,
    history: viHistory, chat: viChat, notifications: viNotifications,
  },
};

export const NAMESPACES = [
  "common", "settings", "dashboard", "analysis", "landing", "reports", "errors",
  "providers", "personality", "developer", "history", "chat", "notifications",
] as const;

export const COOKIE_NAME = "codeinsight-lang";

/**
 * SSR-safe initial locale.
 *
 * The store defaults to "en" on BOTH server and client. The actual locale
 * is set synchronously by <Providers initialLocale={...}> before the first
 * render, using the cookie value read on the server via next/headers.
 *
 * This guarantees server and client render the SAME language — no hydration
 * mismatch.
 */
function getInitialLocale(): Locale {
  // Always default to "en". The Providers component will set the correct
  // locale from the server-read cookie before the first render.
  return "en";
}

// Deep get a value by dot path: t("common","nav.home") → DICTS[locale].common.nav.home
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in (acc as Dict)) return (acc as Dict)[k];
    return undefined;
  }, obj);
}

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (namespace: string, key: string, vars?: Record<string, string | number>) => string;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set, get) => ({
      // Initialize synchronously from cookie — no useEffect, no client-only init.
      // This runs during store creation (both server and client), so the first
      // render already has the correct locale.
      locale: getInitialLocale(),
      setLocale: (locale) => {
        // Set cookie immediately so server-side renders (and reloads) use the
        // new locale from the very first render — no hydration mismatch.
        if (typeof document !== "undefined") {
          document.cookie = `${COOKIE_NAME}=${locale};path=/;max-age=31536000;samesite=lax`;
        }
        set({ locale });
      },
      t: (namespace, key, vars) => {
        const { locale } = get();
        const dict = DICTS[locale]?.[namespace];
        const val = getPath(dict, key);
        let str = typeof val === "string"
          ? val
          : (getPath(DICTS.en[namespace], key) as string) ?? key;
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          }
        }
        return str;
      },
    }),
    {
      name: "codeinsight-ai-i18n",
      // Only persist the locale choice; t() is derived.
      partialize: (s) => ({ locale: s.locale }),
      // Use localStorage as a secondary fallback (cookie is primary for SSR).
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") return window.localStorage;
        // Server-side noop storage
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
    }
  )
);

// Convenience hook — re-renders when locale changes.
export function useT() {
  const locale = useI18nStore((s) => s.locale);
  const t = useI18nStore((s) => s.t);
  return { t, locale, setLocale: useI18nStore((s) => s.setLocale) };
}

export const SUPPORTED_LOCALES: { id: Locale; label: string; flag: string }[] = [
  { id: "en", label: "English", flag: "🇺🇸" },
  { id: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
];
