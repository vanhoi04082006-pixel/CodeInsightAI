// CodeInsight AI — Performance Analyzer
// 40 rules: bundle, React, async, Next.js, query, blocking, memory leaks, layout thrashing
import type { Issue } from "../types";

export function analyzePerformance(files: { path: string; content: string }[]): Issue[] {
  const issues: Issue[] = [];
  for (const { path: fpath, content } of files) {
    const lines = content.split("\n");

    // ── BUNDLE ISSUES ──
    // 1. Entire lodash import
    if (content.match(/import\s+\*\s+as\s+_\s+from\s+['"]lodash['"]/) || content.match(/import\s+_?\s+from\s+['"]lodash['"]/))
      issues.push(mk("bundle","Entire lodash imported","Importing all of lodash ships ~70KB to client.",fpath,fl(lines,"lodash"),"Use 'import debounce from lodash/debounce' or switch to es-toolkit.","high","trivial"));
    // 2. moment.js
    if (content.includes("moment") && !content.includes("moment-timezone"))
      issues.push(mk("bundle","moment.js is very large","moment.js adds ~230KB to bundle.",fpath,fl(lines,"moment"),"Use date-fns or day.js (2KB) instead.","high","medium"));
    // 3. underscore
    if (content.match(/import\s+.*from\s+['"]underscore['"]/))
      issues.push(mk("bundle","underscore imported","underscore adds ~60KB. Use individual lodash/es modules or native JS.",fpath,fl(lines,"underscore"),"Use individual lodash/es modules or native JS.","medium","trivial"));
    // 4. Full rxjs import
    if (content.match(/import\s+\*\s+as\s+.*from\s+['"]rxjs['"]/))
      issues.push(mk("bundle","Full rxjs import","Importing all of rxjs is huge. Use 'import { map } from rxjs/operators'.",fpath,fl(lines,"rxjs"),"Use 'import { map } from rxjs/operators'.","high","medium"));
    // 5. antd full import
    if (content.match(/import\s+.*from\s+['"]antd['"]/) && !content.includes("ConfigProvider"))
      issues.push(mk("bundle","antd full import without tree-shaking","antd may bundle unused components. Use babel-plugin-import or individual imports.",fpath,fl(lines,"antd"),"Use babel-plugin-import or individual imports.","medium","medium"));
    // 6. Barrel re-export (index.ts re-exporting everything)
    if ((fpath.endsWith("index.ts") || fpath.endsWith("index.tsx")) && (content.match(/export\s+\*\s+from\s+['"].*['"]/g) || []).length > 3)
      issues.push(mk("bundle","Barrel file with many re-exports","index.ts re-exports many modules — prevents tree-shaking.",fpath,1,"Split barrel file or use direct imports.","low","small"));

    // ── REACT ISSUES ──
    // 7. Missing useMemo for expensive op
    if ((content.match(/\.sort\s*\(/)||content.match(/\.filter\s*\(/)||content.match(/\.reduce\s*\(/)) && (content.includes("return (")||content.includes("=> ("))) {
      const ln = fl(lines,"sort|filter|reduce");
      if (!lines.slice(Math.max(0,ln-5),ln).some(l=>l.includes("useMemo")||l.includes("useCallback")))
        issues.push(mk("render","Expensive computation in render","Array sort/filter/reduce in render without useMemo.",fpath,ln,"Wrap in useMemo with proper dependencies.","medium","small"));
    }
    // 8. Missing useCallback for handler passed to child
    if (content.match(/onClick\s*=\s*\{/) && content.includes("props.") && !content.includes("useCallback"))
      issues.push(mk("render","Handler not memoized","Function handler created inline and passed to child — causes re-renders.",fpath,fl(lines,"onClick"),"Wrap handler in useCallback.","low","small"));
    // 9. useState with object spread
    if (content.match(/set\w+\s*\(\s*\{\s*\.\.\.\w+/))
      issues.push(mk("state","useState object spread","Spreading state object on every update is wasteful. Use separate useState or useReducer.",fpath,fl(lines,"..."),"Use individual useState hooks or useReducer for complex state.","low","trivial"));
    // 10. Inline style object in JSX
    const inlineStyleCount = (content.match(/style\s*=\s*\{\{/g)||[]).length;
    if (inlineStyleCount > 3)
      issues.push(mk("render","Multiple inline style objects","Dynamic style objects create new references each render — causes re-renders.",fpath,1,"Move static styles to CSS classes or useMemo.","low","medium"));
    // 11. Missing React.memo for exported component
    if (content.match(/export\s+function\s+[A-Z]\w*\s*\(/) && !content.includes("React.memo") && !content.includes("memo("))
      issues.push(mk("render","Component not wrapped in React.memo","Exported component will re-render on every parent render.",fpath,fl(lines,"export function"),"Wrap component in React.memo() if props are stable.","low","trivial"));
    // 12. Large component file (>300 lines .tsx)
    if (fpath.endsWith(".tsx") && lines.length > 300)
      issues.push(mk("render","Large component file",`Component file has ${lines.length} lines — consider splitting.`,fpath,1,"Split into smaller sub-components.","low","medium"));
    // 13. Missing key in list
    if (content.match(/\.map\s*\(/)&&!content.includes("key=")&&!content.includes("key:"))
      issues.push(mk("render","Missing key in list render","React list without key prop causes re-render inefficiency.",fpath,fl(lines,".map"),"Add key={item.id} to each list item.","low","trivial"));
    // 14. Many inline handlers
    const inlineCount = (content.match(/onClick\s*=\s*\{/g)||[]).length;
    if (inlineCount > 3)
      issues.push(mk("render","Many inline handlers","Multiple inline onClick handlers cause child re-renders.",fpath,1,"Extract to useCallback or define outside render.","low","medium"));

    // ── ASYNC / JS ISSUES ──
    // 15. await in loop (sequential, should be Promise.all)
    if (content.match(/for\s*\(.*of\s+.*\)\s*\{[\s\S]*?await\s+/) || content.match(/\.forEach\s*\(.*async/))
      issues.push(mk("async","Sequential await in loop","Awaiting inside a loop is sequential — slow for independent operations.",fpath,fl(lines,"await"),"Use Promise.all() for parallel execution.","medium","medium"));
    // 16. async function without await
    if (content.match(/async\s+function\s+\w+/) && !content.includes("await") && !content.includes(".then("))
      issues.push(mk("async","Async function without await","Function declared async but doesn't use await — unnecessary overhead.",fpath,fl(lines,"async function"),"Remove async keyword or add await.","low","trivial"));
    // 17. console.log in production
    if (content.match(/console\.(log|debug)\s*\(/) && !fpath.includes(".test.") && !fpath.includes(".spec."))
      issues.push(mk("debug","console.log in production","console.log calls in production code waste performance.",fpath,fl(lines,"console"),"Remove or use a conditional logger.","low","trivial"));
    // 18. eval / new Function
    if (content.match(/\beval\s*\(/) || content.match(/new\s+Function\s*\(/))
      issues.push(mk("security","eval or new Function","eval() and new Function() are slow and dangerous.",fpath,fl(lines,"eval|Function"),"Replace with JSON.parse or a safe parser.","high","medium"));
    // 19. setTimeout for animation (should be requestAnimationFrame)
    if (content.match(/setTimeout\s*\(/) && (content.includes("animate") || content.includes("render") || content.includes("canvas")))
      issues.push(mk("render","setTimeout for animation","setTimeout is not synced with refresh rate — use requestAnimationFrame.",fpath,fl(lines,"setTimeout"),"Use requestAnimationFrame for visual updates.","low","small"));

    // ── NEXT.JS ISSUES ──
    // 20. Missing dynamic import for heavy component
    if (content.match(/import\s+\{?\s*(Heavy|Chart|Editor|Canvas|Three)\w*\s*\}?\s+from/) && !content.includes("dynamic("))
      issues.push(mk("next","Heavy component not dynamically imported","Heavy component imported eagerly — increases initial bundle.",fpath,fl(lines,"import"),"Use next/dynamic(() => import('...')) for code-splitting.","medium","small"));
    // 21. <img> instead of next/image
    if (content.includes("<img ") && !content.includes("next/image") && !content.includes("from 'next/image'"))
      issues.push(mk("next","<img> instead of next/image","Using <img> misses automatic optimization, lazy loading, and responsive sizes.",fpath,fl(lines,"<img"),"Use next/image <Image> component.","low","trivial"));
    // 22. Unnecessary "use client"
    if (content.includes('"use client"') && !content.match(/useState|useEffect|useRef|onClick|onChange|onSubmit|useRouter/))
      issues.push(mk("next","Unnecessary use client directive","File has 'use client' but uses no client-only hooks or event handlers.",fpath,1,"Remove 'use client' to enable server rendering.","low","trivial"));

    // ── QUERY / DB ISSUES ──
    // 23. N+1 query
    if (content.match(/\.map\s*\(.*(?:await\s+)?(?:db|prisma)\./))
      issues.push(mk("query","N+1 query pattern","Database query inside .map() — each iteration hits the DB.",fpath,fl(lines,".map"),"Batch with findMany({ where: { id: { in } } }) or use includes().","medium","medium"));
    // 24. Unbounded query
    if (content.match(/findMany\s*\(\s*\)/)&&!content.includes("take:")&&!content.includes("skip:"))
      issues.push(mk("query","Unbounded query — no pagination","findMany without take/skip loads all records.",fpath,fl(lines,"findMany"),"Add take/skip for pagination.","medium","small"));

    // ── BLOCKING I/O ──
    // Sync file operation
    if (content.match(/readFileSync|writeFileSync/i)&&content.match(/app\.(get|post)|router\./))
      issues.push(mk("blocking","Sync file I/O in request handler","readFileSync blocks the event loop.",fpath,fl(lines,"readFileSync|writeFileSync"),"Use fs.promises.readFile instead.","high","small"));

    // RegExp in render
    if (content.match(/new RegExp\s*\(/)&&content.includes("return"))
      issues.push(mk("render","RegExp constructed in render","Creating RegExp in render is expensive.",fpath,fl(lines,"new RegExp"),"Move RegExp outside component or useMemo.","low","trivial"));

    // ── MEMORY LEAKS ──
    // 25. setInterval without clearInterval
    if (content.match(/setInterval\s*\(/) && !content.match(/clearInterval\s*\(/))
      issues.push(mk("memory","setInterval without clearInterval","setInterval started but never cleared — memory leak + zombie callbacks.",fpath,fl(lines,"setInterval"),"Store the id and call clearInterval in useEffect cleanup.","high","small"));
    // 26. addEventListener without removeEventListener
    if (content.match(/addEventListener\s*\(/) && !content.match(/removeEventListener\s*\(/) && fpath.endsWith(".tsx"))
      issues.push(mk("memory","addEventListener without removeEventListener","Event listener added but never removed — memory leak across re-mounts.",fpath,fl(lines,"addEventListener"),"Call removeEventListener in useEffect cleanup.","high","small"));
    // 27. setTimeout without clearTimeout (in component)
    if (content.match(/setTimeout\s*\(/) && !content.match(/clearTimeout\s*\(/) && fpath.endsWith(".tsx") && content.includes("useEffect"))
      issues.push(mk("memory","setTimeout without clearTimeout in effect","setTimeout in useEffect without cleanup — callback fires after unmount.",fpath,fl(lines,"setTimeout"),"Return clearTimeout from useEffect.","medium","trivial"));
    // 28. Subscription without unsubscribe (common RxJS/socket patterns)
    if ((content.match(/\.subscribe\s*\(/) || content.match(/socket\.on\s*\(/)) && !content.match(/\.unsubscribe\s*\(|\.off\s*\(|\.destroy\s*\(/))
      issues.push(mk("memory","Subscription not unsubscribed","Observable/socket subscription without unsubscribe — leak across remounts.",fpath,fl(lines,"subscribe|socket.on"),"Use takeUntil, or unsubscribe in useEffect cleanup.","high","medium"));

    // ── REACT PATTERNS (advanced) ──
    // 29. dangerouslySetInnerHTML (perf: bypasses reconciliation + security risk)
    if (content.includes("dangerouslySetInnerHTML"))
      issues.push(mk("render","dangerouslySetInnerHTML used","Bypasses React reconciliation and is a XSS vector.",fpath,fl(lines,"dangerouslySetInnerHTML"),"Sanitize with DOMPurify or render as React children.","medium","small"));
    // 30. Missing Suspense boundary around React.lazy
    if (content.includes("React.lazy") || content.match(/lazy\s*\(\s*\(/))
      if (!content.includes("<Suspense") && !content.includes("Suspense"))
        issues.push(mk("render","React.lazy without Suspense boundary","Lazy component rendered without Suspense fallback — will throw if not ready.",fpath,fl(lines,"lazy"),"Wrap lazy components in <Suspense fallback={...}>.","medium","trivial"));
    // 31. Deeply nested ternary (readability → slower dev iteration, also branching cost)
    const ternaryCount = (content.match(/\?\s*[^:]*:\s*[^?]*\?/g) || []).length;
    if (ternaryCount >= 2)
      issues.push(mk("render","Nested ternary expressions","Nested ternaries are hard to read and can cause unnecessary re-evaluation.",fpath,1,"Refactor to a lookup map, switch, or early returns.","low","trivial"));
    // 32. Object/array literal as default prop (creates new ref each render)
    if (content.match(/=\s*\{[^}]*\}\s*=\s*\{\s*\}/) || content.match(/=\s*\[[^\]]*\]\s*=\s*\[\s*\]/))
      issues.push(mk("render","Object/array default prop value","Default {} or [] creates a new reference each render — breaks memoization.",fpath,fl(lines,"= {}"),"Use null/undefined default or define the constant outside the component.","low","trivial"));
    // 33. Large inline array literal in JSX
    const arrayLiterals = content.match(/\[\s*["'\w][^\]]{200,}\]/g);
    if (arrayLiterals && arrayLiterals.length > 0)
      issues.push(mk("render","Large inline data in component","Large array/object literal declared inside component — re-allocated every render.",fpath,1,"Move static data outside the component or to a separate module.","low","small"));
    // 34. useEffect with no dependency array (runs every render)
    if (content.match(/useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*\)/) && !content.includes("}, []"))
      issues.push(mk("render","useEffect without dependency array","useEffect without a dependency array runs after every render.",fpath,fl(lines,"useEffect"),"Add a dependency array [] or [deps].","medium","trivial"));
    // 35. Multiple useState for related fields (should useReducer)
    const useStateCount = (content.match(/useState\s*\(/g) || []).length;
    if (useStateCount > 5)
      issues.push(mk("state","Many useState hooks for related state",`${useStateCount} useState calls — related state should be consolidated.`,fpath,1,"Use useReducer for related state transitions.","low","medium"));
    // 36. Missing useCallback for function passed to memoized child
    if (content.includes("React.memo") && content.match(/<\w+\s+on\w+=\{/) && !content.includes("useCallback"))
      issues.push(mk("render","Props to memoized child not wrapped","Passing inline handlers to React.memo children defeats memoization.",fpath,1,"Wrap handlers in useCallback with proper deps.","medium","small"));

    // ── DATA / PARSING ──
    // 37. JSON.parse in render (should be memoized or moved out)
    if (content.match(/JSON\.parse\s*\(/) && (content.includes("return (") || content.includes("=> (")))
      issues.push(mk("render","JSON.parse in render","Parsing JSON in render runs every render — expensive.",fpath,fl(lines,"JSON.parse"),"Parse once outside component or useMemo.","medium","small"));
    // 38. String concatenation in loop (should use array.join)
    if (content.match(/(\+=|\s\+\s).*['"]/) && content.match(/for\s*\(|\.forEach\s*\(|\.map\s*\(/) && !content.includes("join("))
      issues.push(mk("render","String concat in loop","Building strings with += in a loop is O(n²). Use array.push + join.",fpath,fl(lines,"for|forEach|map"),"Collect into an array and .join() at the end.","low","trivial"));

    // ── CSS / LAYOUT ──
    // 39. Layout thrashing: offsetWidth in a loop
    if (content.match(/(offsetWidth|offsetHeight|getBoundingClientRect|clientWidth)\s*\)/) && content.match(/for\s*\(|while\s*\(|\.map\s*\(/))
      issues.push(mk("render","Layout thrashing in loop","Reading layout properties inside a loop forces sync reflow each iteration.",fpath,fl(lines,"offsetWidth|getBoundingClientRect"),"Read all layout values first, then mutate.","high","medium"));
    // 40. document.querySelector in render (should be ref)
    if (content.match(/document\.(querySelector|getElementById)\s*\(/) && content.includes("return ("))
      issues.push(mk("render","DOM query in render","document.querySelector in render is slow and breaks SSR. Use useRef.",fpath,fl(lines,"querySelector|getElementById"),"Use useRef to access DOM nodes.","medium","small"));
  }
  return issues;
}

/**
 * Get positive findings (best practices the repo already follows).
 * Shown when perfIssues.length === 0 to avoid empty tab.
 */
export function getPositiveFindings(files: { path: string; content: string }[]): string[] {
  const findings: string[] = [];
  const allContent = files.map(f => f.content).join("\n");

  if (allContent.includes("useMemo")) findings.push("✅ Uses useMemo for expensive computations");
  if (allContent.includes("useCallback")) findings.push("✅ Uses useCallback for handler memoization");
  if (allContent.includes("React.memo") || allContent.includes("memo(")) findings.push("✅ Wraps components in React.memo");
  if (allContent.includes("dynamic(") || allContent.includes("next/dynamic")) findings.push("✅ Uses dynamic imports for code-splitting");
  if (allContent.includes("next/image") || allContent.includes("<Image")) findings.push("✅ Uses next/image for optimized images");
  if (allContent.includes("Promise.all")) findings.push("✅ Uses Promise.all for parallel async operations");
  if (allContent.includes("requestAnimationFrame")) findings.push("✅ Uses requestAnimationFrame for animations");
  if (allContent.match(/take\s*:/) && allContent.match(/skip\s*:/)) findings.push("✅ Implements pagination on DB queries");
  if (!allContent.includes("moment") && !allContent.includes("lodash")) findings.push("✅ Avoids heavy libraries (moment.js, lodash)");
  if (!allContent.match(/console\.(log|debug)\s*\(/)) findings.push("✅ No console.log calls in production code");
  if (allContent.includes("Suspense")) findings.push("✅ Uses Suspense boundaries around lazy-loaded components");
  if (allContent.includes("useReducer")) findings.push("✅ Uses useReducer for complex state management");
  if (allContent.includes("clearInterval") || allContent.includes("clearTimeout")) findings.push("✅ Properly cleans up timers (clearInterval/clearTimeout)");
  if (allContent.includes("removeEventListener")) findings.push("✅ Properly removes event listeners in cleanup");
  if (allContent.includes(".unsubscribe") || allContent.includes(".off(")) findings.push("✅ Unsubscribes from observables/sockets");
  if (!allContent.includes("dangerouslySetInnerHTML")) findings.push("✅ Avoids dangerouslySetInnerHTML (no XSS risk)");

  return findings;
}

function fl(lines:string[],pat:string):number{const r=new RegExp(pat,"i");for(let i=0;i<lines.length;i++)if(r.test(lines[i]))return i+1;return 1;}
function mk(c:string,t:string,d:string,f:string,l:number,r:string,s:Issue["severity"],e:Issue["effort"]):Issue{return{id:`perf_${Math.random().toString(36).slice(2,9)}`,severity:s,category:c,title:t,description:d,file:f,line:l,recommendation:r,effort:e};}
