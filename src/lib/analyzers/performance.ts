// CodeInsight AI — Performance Analyzer
// 40 rules: bundle, React, async, Next.js, query, blocking, memory leaks, layout thrashing
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

export function analyzePerformance(files: { path: string; content: string }[], language: string = "en"): Issue[] {
  const issues: Issue[] = [];
  const t = (key: string, vars?: Record<string, string | number>) => translateIssue(language, key, vars);
  for (const { path: fpath, content } of files) {
    const lines = content.split("\n");
    for (const r of PERFORMANCE_EXTRA_RULES) {
      if (r.file && !r.file.test(fpath)) continue;
      if (r.neg && r.neg.test(content)) continue;
      if (!r.re.test(content)) continue;
      const ln = fl(lines, r.re.source);
      issues.push(mk(
        r.cat,
        t(`performance.${r.key}.title`),
        t(`performance.${r.key}.description`, { file: fpath }),
        fpath, ln,
        t(`performance.${r.key}.recommendation`),
        r.sev, r.eff,
      ));
    }

    // ── BUNDLE ISSUES ──
    // 1. Entire lodash import
    if (content.match(/import\s+\*\s+as\s+_\s+from\s+['"]lodash['"]/) || content.match(/import\s+_?\s+from\s+['"]lodash['"]/))
      issues.push(mk("bundle",
        t("performance.lodashFull.title"), t("performance.lodashFull.description"),
        fpath, fl(lines,"lodash"),
        t("performance.lodashFull.recommendation"), "high","trivial"));
    // 2. moment.js
    if (content.includes("moment") && !content.includes("moment-timezone"))
      issues.push(mk("bundle",
        t("performance.moment.title"), t("performance.moment.description"),
        fpath, fl(lines,"moment"),
        t("performance.moment.recommendation"), "high","medium"));
    // 3. underscore
    if (content.match(/import\s+.*from\s+['"]underscore['"]/))
      issues.push(mk("bundle",
        t("performance.underscore.title"), t("performance.underscore.description"),
        fpath, fl(lines,"underscore"),
        t("performance.underscore.recommendation"), "medium","trivial"));
    // 4. Full rxjs import
    if (content.match(/import\s+\*\s+as\s+.*from\s+['"]rxjs['"]/))
      issues.push(mk("bundle",
        t("performance.rxjsFull.title"), t("performance.rxjsFull.description"),
        fpath, fl(lines,"rxjs"),
        t("performance.rxjsFull.recommendation"), "high","medium"));
    // 5. antd full import
    if (content.match(/import\s+.*from\s+['"]antd['"]/) && !content.includes("ConfigProvider"))
      issues.push(mk("bundle",
        t("performance.antdFull.title"), t("performance.antdFull.description"),
        fpath, fl(lines,"antd"),
        t("performance.antdFull.recommendation"), "medium","medium"));
    // 6. Barrel re-export (index.ts re-exporting everything)
    if ((fpath.endsWith("index.ts") || fpath.endsWith("index.tsx")) && (content.match(/export\s+\*\s+from\s+['"].*['"]/g) || []).length > 3)
      issues.push(mk("bundle",
        t("performance.barrelFile.title"), t("performance.barrelFile.description"),
        fpath, 1,
        t("performance.barrelFile.recommendation"), "low","small"));

    // ── REACT ISSUES ──
    // 7. Missing useMemo for expensive op
    if ((content.match(/\.sort\s*\(/)||content.match(/\.filter\s*\(/)||content.match(/\.reduce\s*\(/)) && (content.includes("return (")||content.includes("=> ("))) {
      const ln = fl(lines,"sort|filter|reduce");
      if (!lines.slice(Math.max(0,ln-5),ln).some(l=>l.includes("useMemo")||l.includes("useCallback")))
        issues.push(mk("render",
          t("performance.expensiveComputation.title"), t("performance.expensiveComputation.description"),
          fpath, ln,
          t("performance.expensiveComputation.recommendation"), "medium","small"));
    }
    // 8. Missing useCallback for handler passed to child
    if (content.match(/onClick\s*=\s*\{/) && content.includes("props.") && !content.includes("useCallback"))
      issues.push(mk("render",
        t("performance.handlerNotMemoized.title"), t("performance.handlerNotMemoized.description"),
        fpath, fl(lines,"onClick"),
        t("performance.handlerNotMemoized.recommendation"), "low","small"));
    // 9. useState with object spread
    if (content.match(/set\w+\s*\(\s*\{\s*\.\.\.\w+/))
      issues.push(mk("state",
        t("performance.useStateObjectSpread.title"), t("performance.useStateObjectSpread.description"),
        fpath, fl(lines,"..."),
        t("performance.useStateObjectSpread.recommendation"), "low","trivial"));
    // 10. Inline style object in JSX
    const inlineStyleCount = (content.match(/style\s*=\s*\{\{/g)||[]).length;
    if (inlineStyleCount > 3)
      issues.push(mk("render",
        t("performance.multipleInlineStyles.title"), t("performance.multipleInlineStyles.description"),
        fpath, 1,
        t("performance.multipleInlineStyles.recommendation"), "low","medium"));
    // 11. Missing React.memo for exported component
    if (content.match(/export\s+function\s+[A-Z]\w*\s*\(/) && !content.includes("React.memo") && !content.includes("memo("))
      issues.push(mk("render",
        t("performance.componentNotMemoized.title"), t("performance.componentNotMemoized.description"),
        fpath, fl(lines,"export function"),
        t("performance.componentNotMemoized.recommendation"), "low","trivial"));
    // 12. Large component file (>300 lines .tsx)
    if (fpath.endsWith(".tsx") && lines.length > 300)
      issues.push(mk("render",
        t("performance.largeFile.title"),
        t("performance.largeFile.description", { count: lines.length }),
        fpath, 1,
        t("performance.largeFile.recommendation"), "low","medium"));
    // 13. Missing key in list
    if (content.match(/\.map\s*\(/)&&!content.includes("key=")&&!content.includes("key:"))
      issues.push(mk("render",
        t("performance.missingKeyInList.title"), t("performance.missingKeyInList.description"),
        fpath, fl(lines,".map"),
        t("performance.missingKeyInList.recommendation"), "low","trivial"));
    // 14. Many inline handlers
    const inlineCount = (content.match(/onClick\s*=\s*\{/g)||[]).length;
    if (inlineCount > 3)
      issues.push(mk("render",
        t("performance.manyInlineHandlers.title"), t("performance.manyInlineHandlers.description"),
        fpath, 1,
        t("performance.manyInlineHandlers.recommendation"), "low","medium"));

    // ── ASYNC / JS ISSUES ──
    // 15. await in loop (sequential, should be Promise.all)
    if (content.match(/for\s*\(.*of\s+.*\)\s*\{[\s\S]*?await\s+/) || content.match(/\.forEach\s*\(.*async/))
      issues.push(mk("async",
        t("performance.sequentialAwait.title"), t("performance.sequentialAwait.description"),
        fpath, fl(lines,"await"),
        t("performance.sequentialAwait.recommendation"), "medium","medium"));
    // 16. async function without await — REMOVED: duplicate of bugs.asyncFuncNoAwait (logic error, not perf)
    // 17. console.log — REMOVED: duplicate of bugs.consoleLog (code quality, not performance)
    // 18. eval / new Function
    if (content.match(/\beval\s*\(/) || content.match(/new\s+Function\s*\(/))
      issues.push(mk("security",
        t("performance.evalOrNewFunction.title"), t("performance.evalOrNewFunction.description"),
        fpath, fl(lines,"eval|Function"),
        t("performance.evalOrNewFunction.recommendation"), "high","medium"));
    // 19. setTimeout for animation (should be requestAnimationFrame)
    if (content.match(/setTimeout\s*\(/) && (content.includes("animate") || content.includes("render") || content.includes("canvas")))
      issues.push(mk("render",
        t("performance.setTimeoutForAnimation.title"), t("performance.setTimeoutForAnimation.description"),
        fpath, fl(lines,"setTimeout"),
        t("performance.setTimeoutForAnimation.recommendation"), "low","small"));

    // ── NEXT.JS ISSUES ──
    // 20. Missing dynamic import for heavy component
    if (content.match(/import\s+\{?\s*(Heavy|Chart|Editor|Canvas|Three)\w*\s*\}?\s+from/) && !content.includes("dynamic("))
      issues.push(mk("next",
        t("performance.heavyComponentNotDynamic.title"), t("performance.heavyComponentNotDynamic.description"),
        fpath, fl(lines,"import"),
        t("performance.heavyComponentNotDynamic.recommendation"), "medium","small"));
    // 21. <img> instead of next/image
    if (content.includes("<img ") && !content.includes("next/image") && !content.includes("from 'next/image'"))
      issues.push(mk("next",
        t("performance.imgInsteadOfNextImage.title"), t("performance.imgInsteadOfNextImage.description"),
        fpath, fl(lines,"<img"),
        t("performance.imgInsteadOfNextImage.recommendation"), "low","trivial"));
    // 22. Unnecessary "use client"
    if (content.includes('"use client"') && !content.match(/useState|useEffect|useRef|onClick|onChange|onSubmit|useRouter/))
      issues.push(mk("next",
        t("performance.unnecessaryUseClient.title"), t("performance.unnecessaryUseClient.description"),
        fpath, 1,
        t("performance.unnecessaryUseClient.recommendation"), "low","trivial"));

    // ── QUERY / DB ISSUES ──
    // 23. N+1 query
    if (content.match(/\.map\s*\(.*(?:await\s+)?(?:db|prisma)\./))
      issues.push(mk("query",
        t("performance.nPlusOne.title"), t("performance.nPlusOne.description"),
        fpath, fl(lines,".map"),
        t("performance.nPlusOne.recommendation"), "medium","medium"));
    // 24. Unbounded query
    if (content.match(/findMany\s*\(\s*\)/)&&!content.includes("take:")&&!content.includes("skip:"))
      issues.push(mk("query",
        t("performance.unboundedQuery.title"), t("performance.unboundedQuery.description"),
        fpath, fl(lines,"findMany"),
        t("performance.unboundedQuery.recommendation"), "medium","small"));

    // ── BLOCKING I/O ──
    // Sync file operation
    if (content.match(/readFileSync|writeFileSync/i)&&content.match(/app\.(get|post)|router\./))
      issues.push(mk("blocking",
        t("performance.syncFileIo.title"), t("performance.syncFileIo.description"),
        fpath, fl(lines,"readFileSync|writeFileSync"),
        t("performance.syncFileIo.recommendation"), "high","small"));

    // RegExp in render
    if (content.match(/new RegExp\s*\(/)&&content.includes("return"))
      issues.push(mk("render",
        t("performance.regexpInRender.title"), t("performance.regexpInRender.description"),
        fpath, fl(lines,"new RegExp"),
        t("performance.regexpInRender.recommendation"), "low","trivial"));

    // ── MEMORY LEAKS ──
    // 25. setInterval without clearInterval
    if (content.match(/setInterval\s*\(/) && !content.match(/clearInterval\s*\(/))
      issues.push(mk("memory",
        t("performance.setIntervalNoClear.title"), t("performance.setIntervalNoClear.description"),
        fpath, fl(lines,"setInterval"),
        t("performance.setIntervalNoClear.recommendation"), "high","small"));
    // 26. addEventListener without removeEventListener
    if (content.match(/addEventListener\s*\(/) && !content.match(/removeEventListener\s*\(/) && fpath.endsWith(".tsx"))
      issues.push(mk("memory",
        t("performance.addEventListenerNoRemove.title"), t("performance.addEventListenerNoRemove.description"),
        fpath, fl(lines,"addEventListener"),
        t("performance.addEventListenerNoRemove.recommendation"), "high","small"));
    // 27. setTimeout without clearTimeout (in component)
    if (content.match(/setTimeout\s*\(/) && !content.match(/clearTimeout\s*\(/) && fpath.endsWith(".tsx") && content.includes("useEffect"))
      issues.push(mk("memory",
        t("performance.setTimeoutNoClear.title"), t("performance.setTimeoutNoClear.description"),
        fpath, fl(lines,"setTimeout"),
        t("performance.setTimeoutNoClear.recommendation"), "medium","trivial"));
    // 28. Subscription without unsubscribe (common RxJS/socket patterns)
    if ((content.match(/\.subscribe\s*\(/) || content.match(/socket\.on\s*\(/)) && !content.match(/\.unsubscribe\s*\(|\.off\s*\(|\.destroy\s*\(/))
      issues.push(mk("memory",
        t("performance.subscriptionNoUnsubscribe.title"), t("performance.subscriptionNoUnsubscribe.description"),
        fpath, fl(lines,"subscribe|socket.on"),
        t("performance.subscriptionNoUnsubscribe.recommendation"), "high","medium"));

    // ── REACT PATTERNS (advanced) ──
    // 29. dangerouslySetInnerHTML — REMOVED: duplicate of security.xssDangerouslySetInnerHTML (security concern, not perf)
    // 30. Missing Suspense boundary around React.lazy
    if (content.includes("React.lazy") || content.match(/lazy\s*\(\s*\(/))
      if (!content.includes("<Suspense") && !content.includes("Suspense"))
        issues.push(mk("render",
          t("performance.lazyNoSuspense.title"), t("performance.lazyNoSuspense.description"),
          fpath, fl(lines,"lazy"),
          t("performance.lazyNoSuspense.recommendation"), "medium","trivial"));
    // 31. Deeply nested ternary (readability → slower dev iteration, also branching cost)
    const ternaryCount = (content.match(/\?\s*[^:]*:\s*[^?]*\?/g) || []).length;
    if (ternaryCount >= 2)
      issues.push(mk("render",
        t("performance.nestedTernary.title"), t("performance.nestedTernary.description"),
        fpath, 1,
        t("performance.nestedTernary.recommendation"), "low","trivial"));
    // 32. Object/array literal as default prop (creates new ref each render)
    if (content.match(/=\s*\{[^}]*\}\s*=\s*\{\s*\}/) || content.match(/=\s*\[[^\]]*\]\s*=\s*\[\s*\]/))
      issues.push(mk("render",
        t("performance.defaultPropObject.title"), t("performance.defaultPropObject.description"),
        fpath, fl(lines,"= {}"),
        t("performance.defaultPropObject.recommendation"), "low","trivial"));
    // 33. Large inline array literal in JSX
    const arrayLiterals = content.match(/\[\s*["'\w][^\]]{200,}\]/g);
    if (arrayLiterals && arrayLiterals.length > 0)
      issues.push(mk("render",
        t("performance.largeInlineData.title"), t("performance.largeInlineData.description"),
        fpath, 1,
        t("performance.largeInlineData.recommendation"), "low","small"));
    // 34. useEffect with no dependency array (runs every render)
    if (content.match(/useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*\)/) && !content.includes("}, []"))
      issues.push(mk("render",
        t("performance.useEffectNoDeps.title"), t("performance.useEffectNoDeps.description"),
        fpath, fl(lines,"useEffect"),
        t("performance.useEffectNoDeps.recommendation"), "medium","trivial"));
    // 35. Multiple useState for related fields (should useReducer)
    const useStateCount = (content.match(/useState\s*\(/g) || []).length;
    if (useStateCount > 5)
      issues.push(mk("state",
        t("performance.manyUseState.title"),
        t("performance.manyUseState.description", { count: useStateCount }),
        fpath, 1,
        t("performance.manyUseState.recommendation"), "low","medium"));
    // 36. Missing useCallback for function passed to memoized child
    if (content.includes("React.memo") && content.match(/<\w+\s+on\w+=\{/) && !content.includes("useCallback"))
      issues.push(mk("render",
        t("performance.propsToMemoizedChildNotWrapped.title"), t("performance.propsToMemoizedChildNotWrapped.description"),
        fpath, 1,
        t("performance.propsToMemoizedChildNotWrapped.recommendation"), "medium","small"));

    // ── DATA / PARSING ──
    // 37. JSON.parse in render (should be memoized or moved out)
    if (content.match(/JSON\.parse\s*\(/) && (content.includes("return (") || content.includes("=> (")))
      issues.push(mk("render",
        t("performance.jsonParseInRender.title"), t("performance.jsonParseInRender.description"),
        fpath, fl(lines,"JSON.parse"),
        t("performance.jsonParseInRender.recommendation"), "medium","small"));
    // 38. String concatenation in loop (should use array.join)
    if (content.match(/(\+=|\s\+\s).*['"]/) && content.match(/for\s*\(|\.forEach\s*\(|\.map\s*\(/) && !content.includes("join("))
      issues.push(mk("render",
        t("performance.stringConcatInLoop.title"), t("performance.stringConcatInLoop.description"),
        fpath, fl(lines,"for|forEach|map"),
        t("performance.stringConcatInLoop.recommendation"), "low","trivial"));

    // ── CSS / LAYOUT ──
    // 39. Layout thrashing: offsetWidth in a loop
    if (content.match(/(offsetWidth|offsetHeight|getBoundingClientRect|clientWidth)\s*\)/) && content.match(/for\s*\(|while\s*\(|\.map\s*\(/))
      issues.push(mk("render",
        t("performance.layoutThrashing.title"), t("performance.layoutThrashing.description"),
        fpath, fl(lines,"offsetWidth|getBoundingClientRect"),
        t("performance.layoutThrashing.recommendation"), "high","medium"));
    // 40. document.querySelector in render (should be ref)
    if (content.match(/document\.(querySelector|getElementById)\s*\(/) && content.includes("return ("))
      issues.push(mk("render",
        t("performance.domQueryInRender.title"), t("performance.domQueryInRender.description"),
        fpath, fl(lines,"querySelector|getElementById"),
        t("performance.domQueryInRender.recommendation"), "medium","small"));
  }
  return issues;
}

/**
 * Get positive findings (best practices the repo already follows).
 * Shown when perfIssues.length === 0 to avoid empty tab.
 */
export function getPositiveFindings(files: { path: string; content: string }[], language: string = "en"): string[] {
  const findings: string[] = [];
  const allContent = files.map(f => f.content).join("\n");
  const t = (key: string) => translateIssue(language, `positiveFindings.${key}`);

  if (allContent.includes("useMemo")) findings.push(t("useMemo"));
  if (allContent.includes("useCallback")) findings.push(t("useCallback"));
  if (allContent.includes("React.memo") || allContent.includes("memo(")) findings.push(t("reactMemo"));
  if (allContent.includes("dynamic(") || allContent.includes("next/dynamic")) findings.push(t("dynamicImport"));
  if (allContent.includes("next/image") || allContent.includes("<Image")) findings.push(t("nextImage"));
  if (allContent.includes("Promise.all")) findings.push(t("promiseAll"));
  if (allContent.includes("requestAnimationFrame")) findings.push(t("requestAnimationFrame"));
  if (allContent.match(/take\s*:/) && allContent.match(/skip\s*:/)) findings.push(t("pagination"));
  if (!allContent.includes("moment") && !allContent.includes("lodash")) findings.push(t("avoidsHeavyLibs"));
  if (!allContent.match(/console\.(log|debug)\s*\(/)) findings.push(t("noConsoleLog"));
  if (allContent.includes("Suspense")) findings.push(t("suspenseBoundaries"));
  if (allContent.includes("useReducer")) findings.push(t("useReducer"));
  if (allContent.includes("clearInterval") || allContent.includes("clearTimeout")) findings.push(t("cleansUpTimers"));
  if (allContent.includes("removeEventListener")) findings.push(t("removesEventListeners"));
  if (allContent.includes(".unsubscribe") || allContent.includes(".off(")) findings.push(t("unsubscribes"));
  if (!allContent.includes("dangerouslySetInnerHTML")) findings.push(t("noDangerouslySetInnerHTML"));

  return findings;
}

/** Additional multi-language performance rules (38 → performance total 80). */
export const PERFORMANCE_EXTRA_RULES: ExtraRule[] = [
  // ── Loop / algorithm complexity ──
  { key: "oN2IndexOf", sev: "medium", cat: "render", eff: "small", re: /(?:for|forEach)\s*\([^)]*\)[\s\S]{0,120}\.indexOf\s*\(/, neg: /\.indexOf\s*\([^)]*,\s*\w+/ },
  { key: "oN2Includes", sev: "medium", cat: "render", eff: "small", re: /(?:for|forEach)\s*\([^)]*\)[\s\S]{0,120}\.includes\s*\(/, neg: /\.includes\s*\([^)]*,\s*\w+/ },
  { key: "nestedLoop", sev: "medium", cat: "render", eff: "small", re: /(?:for|forEach)\s*\([^)]*\)[\s\S]{0,120}(?:for|forEach)\s*\(/ },
  { key: "deepCloneJson", sev: "high", cat: "render", eff: "small", re: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/ },
  { key: "filterThenMap", sev: "low", cat: "render", eff: "trivial", re: /\.filter\s*\([^)]*\)\s*\.map\s*\(/ },
  { key: "regexInLoop", sev: "medium", cat: "render", eff: "small", re: /(?:for|forEach|while)\s*\([^)]*\)[\s\S]{0,120}new\s+RegExp\s*\(/ },
  { key: "concatInLoop", sev: "medium", cat: "render", eff: "small", re: /(?:for|forEach|while)\s*\([^)]*\)[\s\S]{0,120}\+=\s*["']/ },
  { key: "arrayCopyInLoop", sev: "medium", cat: "memory", eff: "small", re: /(?:for|forEach)\s*\([^)]*\)[\s\S]{0,120}(?:\.push|\.unshift|\.splice)\s*\(/ },
  // ── Async / network ──
  { key: "requestsNoTimeout", sev: "high", cat: "blocking", eff: "small", re: /requests\.(?:get|post|put)\s*\(/, file: /\.py$/, neg: /timeout/ },
  { key: "fetchNoTimeout", sev: "medium", cat: "blocking", eff: "small", re: /\bfetch\s*\(/, file: /\.(js|ts|mjs|tsx)$/, neg: /AbortController|signal:|timeout/ },
  { key: "fetchNoRevalidate", sev: "medium", cat: "query", eff: "small", re: /\bfetch\s*\([^)]*\)/, file: /\.(tsx|ts)$/, neg: /revalidate|cache:|no-store|unstable_cache/ },
  { key: "sleepInHandler", sev: "high", cat: "blocking", eff: "small", re: /time\.sleep\s*\(/, file: /\.py$/, neg: /test|mock/ },
  { key: "sequentialAsync", sev: "medium", cat: "async", eff: "medium", re: /await\s+\w+\([^)]*\);\s*\n[^\n]*await\s+\w+\(/, neg: /Promise\.all|for\s*\(/ },
  { key: "callbackInLoop", sev: "medium", cat: "async", eff: "small", re: /\.forEach\s*\(\s*async\s+/, neg: /Promise\.all/ },
  // ── Bundle / render ──
  { key: "importD3", sev: "high", cat: "bundle", eff: "medium", re: /from\s*["']d3["']|require\s*\(\s*["']d3["']/, neg: /d3-|subpath/ },
  { key: "importThree", sev: "high", cat: "bundle", eff: "medium", re: /from\s*["']three["']|require\s*\(\s*["']three["']/ },
  { key: "importChartJs", sev: "high", cat: "bundle", eff: "medium", re: /from\s*["']chart\.js["']|require\s*\(\s*["']chart\.js["']/ },
  { key: "importJquery", sev: "medium", cat: "bundle", eff: "small", re: /from\s*["']jquery["']|require\s*\(\s*["']jquery["']/ },
  { key: "importBootstrap", sev: "medium", cat: "bundle", eff: "small", re: /from\s*["']bootstrap["']|require\s*\(\s*["']bootstrap["']/ },
  { key: "importAxios", sev: "low", cat: "bundle", eff: "trivial", re: /from\s*["']axios["']/, neg: /\.get|\.post/ },
  { key: "inlineFunctionRender", sev: "medium", cat: "render", eff: "trivial", re: /(?:onClick|onChange|onSubmit|onKeyDown)\s*=\s*\{[^}]*=>/, file: /\.(tsx|jsx)$/, neg: /useCallback/ },
  { key: "objectLiteralProp", sev: "medium", cat: "render", eff: "small", re: /=\s*\{\{[^}]*\}\}/, file: /\.(tsx|jsx)$/ },
  // ── Query / DB ──
  { key: "nPlusOneForLoop", sev: "medium", cat: "query", eff: "medium", re: /for\s*\([^)]*\)[\s\S]{0,160}(?:db\.|prisma\.|pool\.|query\(|\.findMany\s*\()/, neg: /Promise\.all|include:|select:/ },
  { key: "selectStar", sev: "medium", cat: "query", eff: "small", re: /SELECT\s+\*/ , neg: /COUNT\(/ },
  { key: "findAllNoPagination", sev: "medium", cat: "query", eff: "small", re: /findAll\s*\(\s*\)/, file: /\.(js|ts|jsx|tsx)$/ },
  { key: "dbQueryInLoop", sev: "high", cat: "query", eff: "medium", re: /(?:\.query|\.findMany|\.findOne)\s*\([^)]*\)\s*;/, file: /\.(ts|js)$/, neg: /Promise\.all/ },
  { key: "reactiveQueryNoCache", sev: "medium", cat: "query", eff: "small", re: /useQuery\s*\(/, neg: /staleTime|cacheTime|placeholderData/ },
  // ── Memory / layout ──
  { key: "globalVariableAccumulate", sev: "medium", cat: "memory", eff: "small", re: /(?:let|var)\s+\w+\s*=\s*\[\][\s\S]{0,120}\.push\s*\(/, neg: /for\s*\([^)]*\)/ },
  { key: "setIntervalNoCleanup", sev: "high", cat: "memory", eff: "small", re: /setInterval\s*\(/, file: /\.(tsx|jsx)$/, neg: /clearInterval|useEffect/ },
  { key: "domQueryInLoop", sev: "high", cat: "render", eff: "small", re: /(?:for|forEach|while)\s*\([^)]*\)[\s\S]{0,120}document\.(?:querySelector|getElementById)\s*\(/ },
  { key: "layoutThrashInLoop", sev: "high", cat: "render", eff: "small", re: /(?:for|forEach|while)\s*\([^)]*\)[\s\S]{0,120}(?:offsetWidth|offsetHeight|getBoundingClientRect)\s*\(/ },
  { key: "imageNoLazy", sev: "medium", cat: "render", eff: "trivial", re: /<img\s+src=/, file: /\.(tsx|jsx|vue|html)$/, neg: /loading\s*=\s*["']lazy|next\/image|next\.image/ },
  { key: "fontBlocking", sev: "low", cat: "render", eff: "small", re: /@font-face/, file: /\.css$/, neg: /display\s*:\s*swap/ },
  { key: "largeArrayLiteral", sev: "medium", cat: "bundle", eff: "small", re: /\[\s*["'`][^"'`]+["'`][\s,]+["'`][^"'`]+["'`][\s,]+["'`][^"'`]+["'`]/ },
  { key: "unboundedCache", sev: "medium", cat: "memory", eff: "small", re: /new\s+Map\s*\(\s*\)[\s\S]{0,120}\.set\s*\(/, neg: /delete\s*\(|clear\s*\(|LRU/ },
  { key: "syncXhr", sev: "high", cat: "blocking", eff: "small", re: /XMLHttpRequest[\s\S]{0,80}false\s*\)|open\s*\(\s*["']GET["']\s*,\s*[^,]+,\s*false/ },
  { key: "heavyImportDynamic", sev: "medium", cat: "bundle", eff: "small", re: /import\s+\{?\s*(?:Chart|Editor|Three|Map|Player|Pdf|Excel)\w*\s*\}?\s+from/, neg: /dynamic\s*\(|next\/dynamic/ },
  { key: "localStorageInRender", sev: "low", cat: "render", eff: "small", re: /localStorage\.(?:getItem|setItem)\s*\(/, file: /\.(tsx|jsx)$/, neg: /useEffect|useState/ },
];

function fl(lines:string[],pat:string):number{const r=new RegExp(pat,"i");for(let i=0;i<lines.length;i++)if(r.test(lines[i]))return i+1;return 1;}
function mk(c:string,t:string,d:string,f:string,l:number,r:string,s:Issue["severity"],e:Issue["effort"]):Issue{return{id:`perf_${Math.random().toString(36).slice(2,9)}`,severity:s,category:c,title:t,description:d,file:f,line:l,recommendation:r,effort:e};}
