// CodeInsight AI — Issues i18n helper
// Backend translation for static analyzer issue rule strings
// (title / description / recommendation) used by security.ts, bugs.ts, performance.ts.
//
// Locale files live at locales/{en,vi}/issues.json and share the SAME key set.
// The helper picks the dict matching `lang`, falls back to English when the
// locale is unknown or a key is missing, and finally falls back to the raw key.
//
// Variable substitution: `{name}`, `{line}`, `{file}`, `{count}` … are
// replaced by entries of the optional `vars` map.
//
// This module is independent of the React i18n store (`src/lib/i18n.ts`) so
// analyzers running on the server / in workers can use it without pulling in
// zustand. The "issues" namespace is ALSO registered in i18n.ts so UI
// components can look up rule strings via `t("issues", "security.xxx.title")`.
import enIssues from "../../locales/en/issues.json";
import viIssues from "../../locales/vi/issues.json";

type IssueNode = { [k: string]: string | IssueNode };
type IssuesDict = IssueNode;

const DICTS: Record<string, IssuesDict> = {
  en: enIssues as unknown as IssuesDict,
  vi: viIssues as unknown as IssuesDict,
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
 * Translate an issue rule string by dot-path key.
 *
 * @param lang  Locale code, e.g. "en" or "vi". Unknown locales fall back to "en".
 * @param key   Dot path, e.g. "security.hardcodedCred.title".
 * @param vars  Optional substitutions, e.g. { line: 42, file: "auth.ts" }.
 * @returns Translated string, or the raw key if both the locale and English miss.
 */
export function translateIssue(
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
