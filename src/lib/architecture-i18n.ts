// CodeInsight AI — Architecture i18n helper
// Backend translation for architecture analyzer strings (pattern names +
// descriptions, layer names + responsibilities, strengths/weaknesses prose,
// tech-debt item title/impact/estimate) used by analyzers/architecture.ts.
//
// Locale files live at locales/{en,vi}/architecture.json and share the SAME
// key set. The helper picks the dict matching `lang`, falls back to English
// when the locale is unknown or a key is missing, and finally falls back to
// the raw key.
//
// Variable substitution: `{value}`, `{count}`, `{file}`, `{from}`, `{to}`,
// `{ts}`, `{total}`, `{cx}`, `{lines}`, `{fn}` … are replaced by entries of
// the optional `vars` map.
//
// This module is independent of the React i18n store (`src/lib/i18n.ts`) so
// the architecture analyzer running on the server / in workers can use it
// without pulling in zustand. The "architecture" namespace is ALSO registered
// in i18n.ts so UI components can look up architecture strings via
// `t("architecture", "patterns.featureBased.name")`.
import enArch from "../../locales/en/architecture.json";
import viArch from "../../locales/vi/architecture.json";

type ArchNode = { [k: string]: string | ArchNode };
type ArchDict = ArchNode;

const DICTS: Record<string, ArchDict> = {
  en: enArch as unknown as ArchDict,
  vi: viArch as unknown as ArchDict,
};

/** Deep-lookup a dot-path key inside a (possibly nested) object. */
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

/**
 * Translate an architecture string by dot-path key.
 *
 * @param lang  Locale code, e.g. "en" or "vi". Unknown locales fall back to "en".
 * @param key   Dot path, e.g. "patterns.featureBased.name" or "techDebt.highComplexity.title".
 * @param vars  Optional substitutions, e.g. { value: 2.3, file: "src/app.ts" }.
 * @returns Translated string, or the raw key if both the locale and English miss.
 */
export function translateArch(
  lang: string,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTS[lang] ?? DICTS.en;
  let val = getPath(dict, key);
  if (typeof val !== "string") {
    // Fallback: English
    val = getPath(DICTS.en, key);
  }
  let str = typeof val === "string" ? val : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      // Escape regex meta-characters in the var name just in case.
      const safe = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      str = str.replace(new RegExp(`\\{${safe}\\}`, "g"), String(v));
    }
  }
  return str;
}
