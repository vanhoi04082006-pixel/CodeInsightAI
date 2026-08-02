// CodeInsight AI — Bug Analyzer
import type { Issue } from "../types";
import { translateIssue } from "../issues-i18n";

/** A table-driven extra rule. `re` is matched against whole file content. */
interface ExtraRule {
  key: string;
  sev: Issue["severity"];
  cat: string;
  eff: Issue["effort"];
  re: RegExp;
  /** If this matches the content, the rule is skipped. */
  neg?: RegExp;
  /** If present, the file path must match for the rule to apply. */
  file?: RegExp;
}

export function analyzeBugs(files: { path: string; content: string }[], language: string = "en"): Issue[] {
  const issues: Issue[] = [];
  const t = (key: string, vars?: Record<string, string | number>) => translateIssue(language, key, vars);
  for (const { path: fpath, content } of files) {
    const lines = content.split("\n");
    for (const r of BUGS_EXTRA_RULES) {
      if (r.file && !r.file.test(fpath)) continue;
      if (r.neg && r.neg.test(content)) continue;
      if (!r.re.test(content)) continue;
      const ln = fl(lines, r.re.source);
      issues.push(mk(
        r.cat,
        t(`bugs.${r.key}.title`),
        t(`bugs.${r.key}.description`, { file: fpath }),
        fpath, ln,
        t(`bugs.${r.key}.recommendation`),
        r.sev, r.eff,
      ));
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Null reference — accessing .id / .name without null check on ctx/user
      if (line.match(/ctx\.user\.(id|name|role|email)/) && !lines.slice(Math.max(0,i-3),i+1).some(l=>l.includes("if")||l.includes("?")||l.includes("throw")))
        issues.push(mk(
          "null-ref",
          t("bugs.nullDeref.title"),
          t("bugs.nullDeref.description", { line: i + 1 }),
          fpath, i + 1,
          t("bugs.nullDeref.recommendation"),
          "high", "small",
        ));

      // Missing dependency array in useEffect
      if (line.match(/useEffect\s*\(/)&&!lines.slice(i,i+10).some(l=>l.match(/\],\s*\[/)))
        issues.push(mk(
          "hooks",
          t("bugs.missingDeps.title"),
          t("bugs.missingDeps.description"),
          fpath, i + 1,
          t("bugs.missingDeps.recommendation"),
          "medium", "trivial",
        ));

      // Async state update after unmount
      if (line.match(/useEffect\s*\(.*async/)&&!lines.slice(i,i+15).some(l=>l.includes("AbortController")||l.includes("mounted")||l.includes("cancelled")||l.includes("ignore")))
        issues.push(mk(
          "race",
          t("bugs.asyncStateAfterUnmount.title"),
          t("bugs.asyncStateAfterUnmount.description"),
          fpath, i + 1,
          t("bugs.asyncStateAfterUnmount.recommendation"),
          "medium", "small",
        ));

      // Promise without catch
      if (line.match(/\.then\s*\(/)&&!lines.slice(i,i+5).some(l=>l.includes(".catch")||l.includes("try")||l.includes("await")))
        issues.push(mk(
          "promise",
          t("bugs.unhandledRejection.title"),
          t("bugs.unhandledRejection.description"),
          fpath, i + 1,
          t("bugs.unhandledRejection.recommendation"),
          "medium", "trivial",
        ));

      // == instead of ===
      if (line.match(/[^=!<>]==[^=]/)&&!line.includes("typeof")&&!line.includes("=="))
        issues.push(mk(
          "equality",
          t("bugs.looseEquality.title"),
          t("bugs.looseEquality.description"),
          fpath, i + 1,
          t("bugs.looseEquality.recommendation"),
          "low", "trivial",
        ));

      // console.log in production — skip if logging a secret (caught by security.secretInLogs)
      if (line.match(/console\.(log|debug)\s*\(/)&&!fpath.includes(".test.")&&!fpath.includes(".spec.")&&!line.match(/(?:token|password|secret|apiKey|authorization)/i))
        issues.push(mk(
          "debug",
          t("bugs.consoleLog.title"),
          t("bugs.consoleLog.description"),
          fpath, i + 1,
          t("bugs.consoleLog.recommendation"),
          "low", "trivial",
        ));

      // var instead of let/const
      if (line.match(/\bvar\s+/))
        issues.push(mk(
          "modern",
          t("bugs.varInsteadOfLetConst.title"),
          t("bugs.varInsteadOfLetConst.description"),
          fpath, i + 1,
          t("bugs.varInsteadOfLetConst.recommendation"),
          "low", "trivial",
        ));

      // Empty catch block
      if (line.match(/catch\s*\([^)]*\)\s*\{/) && (i+1<lines.length) && lines[i+1].trim()==="}")
        issues.push(mk(
          "exception",
          t("bugs.emptyCatch.title"),
          t("bugs.emptyCatch.description"),
          fpath, i + 1,
          t("bugs.emptyCatch.recommendation"),
          "medium", "trivial",
        ));

      // Missing await
      if (line.match(/\bawait\s+/) && lines[i-1] && lines[i-1].match(/return\s+/) && !lines[i-1].includes("await"))
        issues.push(mk(
          "async",
          t("bugs.missingAwait.title"),
          t("bugs.missingAwait.description"),
          fpath, i,
          t("bugs.missingAwait.recommendation"),
          "medium", "small",
        ));
    }

    // Infinite loop detection — while(true) without break
    if (content.match(/while\s*\(\s*true\s*\)/)) {
      const whileLine = fl(lines,"while.*true");
      if (!lines.slice(whileLine-1, whileLine+20).some(l=>l.includes("break")||l.includes("return")))
        issues.push(mk(
          "infinite",
          t("bugs.infiniteLoop.title"),
          t("bugs.infiniteLoop.description"),
          fpath, whileLine,
          t("bugs.infiniteLoop.recommendation"),
          "high", "medium",
        ));
    }

    // Unused variables (simplified — const/let never referenced again)
    const varMatches = [...content.matchAll(/(?:const|let)\s+(\w+)\s*=/g)];
    for (const vm of varMatches) {
      const varName = vm[1];
      if (["module","exports","process","console"].includes(varName)) continue;
      const rest = content.substring(vm.index! + vm[0].length);
      if (!rest.includes(varName)) {
        const ln = content.substring(0, vm.index).split("\n").length;
        issues.push(mk(
          "unused",
          t("bugs.unusedVariable.title", { name: varName }),
          t("bugs.unusedVariable.description", { name: varName }),
          fpath, ln,
          t("bugs.unusedVariable.recommendation"),
          "low", "trivial",
        ));
      }
    }
  }
  return issues;
}
/** Additional multi-language bug rules (69 → bugs total 80). */
export const BUGS_EXTRA_RULES: ExtraRule[] = [
  // ── Null / undefined (multi-language) ──
  { key: "goNilDeref", sev: "high", cat: "null-ref", eff: "small", re: /\.\w+\.\w+\s*[\[(]/, file: /\.go$/, neg: /\?\./ },
  { key: "javaNullDeref", sev: "high", cat: "null-ref", eff: "small", re: /\b\w+\.\w+\.(?:getName|getId|toString)\s*\(/, file: /\.java$/, neg: /null|Optional/ },
  { key: "pyDictBareIndex", sev: "medium", cat: "null-ref", eff: "small", re: /\b\w+\[["'][^"']+["']\]/, file: /\.py$/, neg: /\.get\s*\(|\.setdefault|in\s+["']/ },
  { key: "pyAttrUnchecked", sev: "medium", cat: "null-ref", eff: "small", re: /\b\w+\.(?:\w+)\s*\.\w+/, file: /\.py$/, neg: /\?\.|getattr|try/ },
  { key: "phpUndefinedIndex", sev: "medium", cat: "null-ref", eff: "small", re: /\$_\w+\[["'][^"']+["']\]/, file: /\.php$/, neg: /isset\s*\(|array_key_exists/ },
  { key: "jsMaybeUndefined", sev: "medium", cat: "null-ref", eff: "small", re: /\.find\s*\([^)]*\)\s*\.\w+/, neg: /\?\.|\?\?|undefined|if\s*\(|&&|\|\|/ },
  // ── Async / concurrency ──
  { key: "promiseNoCatch", sev: "high", cat: "promise", eff: "small", re: /\.then\s*\([^)]*\)\s*;/, neg: /\.catch|await|async\s/ },
  { key: "asyncFuncNoAwait", sev: "low", cat: "async", eff: "trivial", re: /async\s+function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/, neg: /await|Promise|\.then|async/ },
  { key: "callbackErrIgnored", sev: "medium", cat: "exception", eff: "small", re: /function\s*\([^)]*err[^)]*\)\s*\{\s*\}/, file: /\.js$/ },
  { key: "pyBareExcept", sev: "high", cat: "exception", eff: "small", re: /except\s*:/, file: /\.py$/ },
  { key: "phpErrorSuppression", sev: "medium", cat: "exception", eff: "trivial", re: /@\s*(?:file_get_contents|fopen|mysql_query|include|require)/, file: /\.php$/ },
  // ── Equality / type ──
  { key: "pyIsComparison", sev: "high", cat: "equality", eff: "trivial", re: /\b\w+\s+is\s+["']/, file: /\.py$/ },
  { key: "javaStringEq", sev: "high", cat: "equality", eff: "small", re: /\w+\s*==\s*["']/, file: /\.java$/ },
  { key: "goStringConcatByte", sev: "medium", cat: "equality", eff: "small", re: /\+\[\]byte|\+\s*\[\]byte/, file: /\.go$/ },
  { key: "parseIntNoRadix", sev: "high", cat: "modern", eff: "trivial", re: /parseInt\s*\(\s*[^,)]+\)/ },
  { key: "floatEquality", sev: "medium", cat: "equality", eff: "small", re: /\d+\.\d+\s*===\s*\w+|\w+\s*===\s*\d+\.\d+/ },
  { key: "typeofObjectNull", sev: "medium", cat: "equality", eff: "trivial", re: /typeof\s+\w+\s*===\s*["']object["']/, neg: /!==\s*null|null\s*!==/ },
  { key: "jsIsNaN", sev: "medium", cat: "equality", eff: "trivial", re: /\w+\s*===\s*NaN|NaN\s*===\s*\w+/ },
  // ── Language footguns ──
  { key: "cStrcpy", sev: "critical", cat: "memory", eff: "medium", re: /\bstrcpy\s*\(/, file: /\.(c|h|cpp|hpp)$/ },
  { key: "cGets", sev: "critical", cat: "memory", eff: "medium", re: /\bgets\s*\(/, file: /\.(c|h|cpp|hpp)$/ },
  { key: "cSprintf", sev: "high", cat: "memory", eff: "medium", re: /\bsprintf\s*\(/, file: /\.(c|h|cpp|hpp)$/ },
  { key: "cUnsafeConcat", sev: "high", cat: "memory", eff: "small", re: /\bstrcat\s*\(/, file: /\.(c|h|cpp|hpp)$/ },
  { key: "pyMutableDefault", sev: "high", cat: "modern", eff: "small", re: /def\s+\w+\s*\([^)]*=\s*\[\]|def\s+\w+\s*\([^)]*=\s*\{\}/, file: /\.py$/ },
  { key: "pySwitchMissing", sev: "low", cat: "modern", eff: "trivial", re: /if\s+\w+\s*==\s*["']\w+["']\s*:/, file: /\.py$/ },
  { key: "phpOldStyleArray", sev: "low", cat: "modern", eff: "trivial", re: /\$\w+\s*=\s*array\s*\(/, file: /\.php$/ },
  { key: "goDeferInLoop", sev: "high", cat: "memory", eff: "small", re: /for\s[^{]*\{[^}]*defer\s+/, file: /\.go$/ },
  { key: "goSliceOutOfRange", sev: "high", cat: "null-ref", eff: "small", re: /\[\s*\w+\s*\+\s*\w+\s*\]/, file: /\.go$/ },
  // ── Logic / resource ──
  { key: "offByOne", sev: "high", cat: "logic", eff: "small", re: /<=\s*\w+\.length|<\s*\w+\.length\s*-\s*\d+/, neg: /for\s*\(|while\s*\(/ },
  { key: "assignmentInCondition", sev: "critical", cat: "logic", eff: "trivial", re: /if\s*\([^=<>!]*\w+\s*=\s*[^=\s]/, neg: /===|==|!=|<=|>=/ },
  { key: "switchFallthrough", sev: "medium", cat: "logic", eff: "small", re: /case\s+[^:]+:\s*\n[^\n]*\n[^\n]*case\s+/, neg: /break|return|throw/ },
  { key: "unusedPromise", sev: "medium", cat: "promise", eff: "small", re: /\b\w+\s*=\s*\w+\.then\s*\([^)]*\)\s*;/, neg: /await|return/ },
  { key: "resourceNotClosed", sev: "medium", cat: "memory", eff: "small", re: /(?:fopen|open|open\(|fs\.createReadStream)\s*\(/, file: /\.(php|py|js|ts)$/, neg: /close\(|fclose|with\s+open|pipeline|destroy/ },
  { key: "infiniteRecursion", sev: "high", cat: "logic", eff: "medium", re: /function\s+(\w+)\s*\([^)]*\)\s*\{[^}]*\1\s*\(/, neg: /if|return|=>/ },
  { key: "sqlNoWhere", sev: "high", cat: "logic", eff: "small", re: /DELETE\s+FROM\s+\w+\s*;|TRUNCATE\s+TABLE\s+\w+\s*;/, neg: /WHERE/ },
  { key: "goIgnoredError", sev: "high", cat: "exception", eff: "small", re: /,\s*err\s*:=\s*\w+\(/, file: /\.go$/, neg: /if\s+err\s*[!=]=?/ },
  // ── JS / React specific ──
  { key: "staleClosure", sev: "medium", cat: "logic", eff: "small", re: /useEffect\s*\([^)]*,\s*\[\s*\]\s*\)[\s\S]{0,200}\b\w+\b/, neg: /ref|set\w+/ },
  { key: "keyIndexInList", sev: "medium", cat: "render", eff: "trivial", re: /\.map\s*\([^)]*,\s*index\s*\)[\s\S]{0,80}key\s*=\s*\{\s*index\s*\}/ },
  { key: "dangerousSetState", sev: "high", cat: "race", eff: "small", re: /setState\s*\(\s*this\.state/, file: /\.(js|ts|jsx|tsx)$/ },
  { key: "onClickInvoke", sev: "high", cat: "logic", eff: "trivial", re: /onClick\s*=\s*\{\s*\w+\s*\(\s*\)\s*\}/ },
  { key: "mutatingProps", sev: "high", cat: "logic", eff: "small", re: /this\.props\.\w+\s*=\s*|props\.\w+\s*=\s*/, file: /\.(js|ts|jsx|tsx)$/ },
  { key: "getDerivedState", sev: "medium", cat: "logic", eff: "small", re: /setState\s*\(\s*\w+/ },
  { key: "promiseAllMissing", sev: "medium", cat: "async", eff: "small", re: /\.map\s*\(\s*async\s+/, neg: /Promise\.all/ },
  { key: "awaitInMap", sev: "medium", cat: "async", eff: "small", re: /\.map\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{[^}]*\bawait\b/, neg: /Promise\.all/ },
  { key: "hardcodedLocale", sev: "low", cat: "logic", eff: "small", re: /toLocaleString\s*\(\s*["'](?:en|vi|fr|de|ja|zh)["']/, neg: /i18n|t\(/ },
  // ── More null/undefined safety ──
  { key: "goMapNoCommaOk", sev: "medium", cat: "null-ref", eff: "small", re: /\w+\[\s*["']\w+["']\s*\]\s*=\s*\w+\./, file: /\.go$/, neg: /, ok|if\s+/ },
  { key: "pyReturnNoneAttr", sev: "medium", cat: "null-ref", eff: "small", re: /return\s+\w+\.\w+[\s\n]*\n[^\n]*\.\w+/, file: /\.py$/, neg: /is\s+None|\?\?/ },
  { key: "javaBoxedUnbox", sev: "medium", cat: "equality", eff: "small", re: /(?:Integer|Long|Boolean)\s+\w+\s*=\s*[^;]+;\s*\n[^\n]*\w+\s*==\s*\w+/, file: /\.java$/ },
  // ── More async / concurrency ──
  { key: "floatingPromise", sev: "high", cat: "promise", eff: "small", re: /\w+\.\w+\([^)]*\);\s*\n(?!.*await)/, file: /\.(js|ts|mjs|tsx)$/, neg: /await|return|=>/ },
  { key: "setIntervalCallbackSync", sev: "low", cat: "async", eff: "small", re: /setInterval\s*\([^)]*\)\s*;/ },
  { key: "nonAwaitAsyncCall", sev: "high", cat: "async", eff: "small", re: /\w+\s*:\s*async\s*\([^)]*\)\s*=>\s*\{[^}]*\}/, file: /\.(ts|tsx|js|jsx)$/, neg: /await|catch|\.then/ },
  // ── More language footguns ──
  { key: "cUncheckedBuffer", sev: "high", cat: "memory", eff: "medium", re: /char\s+\w+\s*\[\s*\d+\s*\]\s*;/, file: /\.(c|h|cpp|hpp)$/ },
  { key: "cIntOverflow", sev: "medium", cat: "logic", eff: "small", re: /int\s+\w+\s*=\s*\w+\s*\*\s*\w+/, file: /\.(c|h|cpp|hpp)$/ },
  { key: "pyExceptOnException", sev: "medium", cat: "exception", eff: "small", re: /except\s+Exception\s*:/, file: /\.py$/ },
  { key: "pyGlobalMutation", sev: "low", cat: "logic", eff: "trivial", re: /global\s+\w+/, file: /\.py$/ },
  { key: "goStringCompareBytes", sev: "low", cat: "equality", eff: "small", re: /\[\]byte\s*\([^)]*\)\s*==\s*\[\]byte/, file: /\.go$/ },
  // ── More logic / resource ──
  { key: "divideByZero", sev: "critical", cat: "logic", eff: "small", re: /\/\s*\w+\s*\*\s*0|%\s*0\b/ },
  { key: "duplicateCase", sev: "medium", cat: "logic", eff: "small", re: /case\s+["']?\w+["']?\s*:[\s\S]{0,80}case\s+["']?\w+["']?\s*:/, neg: /break/ },
  { key: "stringConcatPitfall", sev: "low", cat: "logic", eff: "trivial", re: /["']\s*\+\s*\d+\s*\+\s*["']/ },
  { key: "comparingThis", sev: "low", cat: "logic", eff: "trivial", re: /this\s*===\s*\w+|this\s*==\s*\w+/, neg: /this\./ },
];

function fl(lines:string[],pat:string):number{const r=new RegExp(pat,"i");for(let i=0;i<lines.length;i++)if(r.test(lines[i]))return i+1;return 1;}
function mk(c:string,t:string,d:string,f:string,l:number,r:string,s:Issue["severity"],e:Issue["effort"]):Issue{return{id:`bug_${Math.random().toString(36).slice(2,9)}`,severity:s,category:c,title:t,description:d,file:f,line:l,recommendation:r,effort:e};}
