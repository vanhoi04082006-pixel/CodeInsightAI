"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Locale = "en" | "vi";

// Locale messages are imported as static JSON (Next.js supports JSON imports).
import enCommon from "../../locales/en/common.json";
import enSettings from "../../locales/en/settings.json";
import enDashboard from "../../locales/en/dashboard.json";
import enAnalysis from "../../locales/en/analysis.json";
import enLanding from "../../locales/en/landing.json";
import enReports from "../../locales/en/reports.json";
import enErrors from "../../locales/en/errors.json";
import viCommon from "../../locales/vi/common.json";
import viSettings from "../../locales/vi/settings.json";
import viDashboard from "../../locales/vi/dashboard.json";
import viAnalysis from "../../locales/vi/analysis.json";
import viLanding from "../../locales/vi/landing.json";
import viReports from "../../locales/vi/reports.json";
import viErrors from "../../locales/vi/errors.json";

type Dict = Record<string, unknown>;

const DICTS: Record<Locale, Record<string, Dict>> = {
  en: {
    common: enCommon, settings: enSettings, dashboard: enDashboard,
    analysis: enAnalysis, landing: enLanding, reports: enReports, errors: enErrors,
  },
  vi: {
    common: viCommon, settings: viSettings, dashboard: viDashboard,
    analysis: viAnalysis, landing: viLanding, reports: viReports, errors: viErrors,
  },
};

// Browser-language detection
function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("vi")) return "vi";
  return "en";
}

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  initFromBrowser: () => void;
  t: (namespace: string, key: string, vars?: Record<string, string | number>) => string;
}

// Deep get a value by dot path: t("common","nav.home") → DICTS[locale].common.nav.home
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in (acc as Dict)) return (acc as Dict)[k];
    return undefined;
  }, obj);
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set, get) => ({
      locale: "en",
      setLocale: (locale) => set({ locale }),
      initFromBrowser: () => {
        const { locale } = get();
        // only auto-detect if the user hasn't explicitly chosen (persisted value exists)
        const persisted = typeof localStorage !== "undefined" && localStorage.getItem("codeinsight-ai-i18n");
        if (!persisted) {
          set({ locale: detectLocale() });
        } else if (locale !== "en" && locale !== "vi") {
          set({ locale: "en" });
        }
      },
      t: (namespace, key, vars) => {
        const { locale } = get();
        const dict = DICTS[locale]?.[namespace];
        const val = getPath(dict, key);
        let str = typeof val === "string" ? val : (getPath(DICTS.en[namespace], key) as string) ?? key;
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
    }
  )
);

// Convenience hook
export function useT() {
  const locale = useI18nStore((s) => s.locale);
  const t = useI18nStore((s) => s.t);
  return { t, locale, setLocale: useI18nStore((s) => s.setLocale) };
}

export const SUPPORTED_LOCALES: { id: Locale; label: string; flag: string }[] = [
  { id: "en", label: "English", flag: "🇺🇸" },
  { id: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
];
