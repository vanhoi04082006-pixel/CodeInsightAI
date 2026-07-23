"use client";

import { create } from "zustand";

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
import enAgents from "../../locales/en/agents.json";
import enMission from "../../locales/en/mission.json";
import enCodegraph from "../../locales/en/codegraph.json";
import enAdmin from "../../locales/en/admin.json";
import enPro from "../../locales/en/pro.json";

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
import viAgents from "../../locales/vi/agents.json";
import viMission from "../../locales/vi/mission.json";
import viCodegraph from "../../locales/vi/codegraph.json";
import viAdmin from "../../locales/vi/admin.json";
import viPro from "../../locales/vi/pro.json";

type Dict = Record<string, unknown>;

export const DICTS: Record<Locale, Record<string, Dict>> = {
  en: {
    common: enCommon, settings: enSettings, dashboard: enDashboard,
    analysis: enAnalysis, landing: enLanding, reports: enReports, errors: enErrors,
    providers: enProviders, personality: enPersonality, developer: enDeveloper,
    history: enHistory, chat: enChat, notifications: enNotifications, agents: enAgents,
    mission: enMission, codegraph: enCodegraph, admin: enAdmin, pro: enPro,
  },
  vi: {
    common: viCommon, settings: viSettings, dashboard: viDashboard,
    analysis: viAnalysis, landing: viLanding, reports: viReports, errors: viErrors,
    providers: viProviders, personality: viPersonality, developer: viDeveloper,
    history: viHistory, chat: viChat, notifications: viNotifications, agents: viAgents,
    mission: viMission, codegraph: viCodegraph, admin: viAdmin, pro: viPro,
  },
};

export const NAMESPACES = [
  "common", "settings", "dashboard", "analysis", "landing", "reports", "errors",
  "providers", "personality", "developer", "history", "chat", "notifications", "agents",
  "mission", "codegraph", "admin", "pro",
] as const;

export const COOKIE_NAME = "codeinsight-lang";

// Module-level variable set by Providers before first render.
// This is the ONLY way to pass the server-read locale to the store
// without causing a hydration mismatch.
let __initialLocale: Locale = "en";

/** Called by <Providers initialLocale={...}> BEFORE the store is used. */
export function setInitialLocale(locale: Locale) {
  __initialLocale = locale;
}

/**
 * SSR-safe initial locale.
 *
 * Always returns "en" at store creation time (both server and client).
 * The Providers component overrides this synchronously via setState()
 * with the server-read cookie value BEFORE any child component reads
 * the store. This guarantees server and client render the SAME language.
 */
function getInitialLocale(): Locale {
  return "en";
}

// Deep get a value by dot path
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

export const useI18nStore = create<I18nState>()((set, get) => ({
  // Initialize from cookie (client) or module-level variable (server).
  // NO persist middleware — the cookie is the single source of truth,
  // readable on both server and client. This eliminates the localStorage
  // vs cookie race condition that caused hydration mismatch.
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
}));

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
