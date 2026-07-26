// Synchronous i18n for backend code (no React hook needed).
// Used by analysis-engine-v2.ts to generate language-aware static
// analysis reports. Picks the right locale file based on `lang`,
// falls back to English, then to the raw key.
//
// Supports `{var}` placeholder substitution (same convention as the
// frontend useT() helper).
import enStatic from "../../locales/en/static.json";
import viStatic from "../../locales/vi/static.json";
import enReports from "../../locales/en/reports.json";
import viReports from "../../locales/vi/reports.json";

type Dict = Record<string, unknown>;

const DICTS: Record<string, { static: Dict; reports: Dict }> = {
  en: { static: enStatic as Dict, reports: enReports as Dict },
  vi: { static: viStatic as Dict, reports: viReports as Dict },
};

/** Deep-get a value by dot path (e.g. "roadmap.phase1.title"). */
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in (acc as Dict)) {
      return (acc as Dict)[k];
    }
    return undefined;
  }, obj);
}

/**
 * Synchronous translation for backend code.
 *
 * @param lang      "en" | "vi" (any other value falls back to "en")
 * @param namespace "static" | "reports"
 * @param key       dot path into the locale file
 * @param vars      optional {var} replacement map
 */
export function translate(
  lang: string,
  namespace: "static" | "reports",
  key: string,
  vars?: Record<string, string | number>,
): string {
  const langDict = DICTS[lang]?.[namespace];
  const enDict = DICTS.en[namespace];

  const val = langDict ? getPath(langDict, key) : undefined;
  let str: string;
  if (typeof val === "string") {
    str = val;
  } else {
    const enVal = getPath(enDict, key);
    str = typeof enVal === "string" ? enVal : key;
  }

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}
