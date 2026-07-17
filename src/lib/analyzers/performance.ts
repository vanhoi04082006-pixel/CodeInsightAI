// CodeInsight AI — Performance Analyzer
import type { Issue } from "../types";

export function analyzePerformance(files: { path: string; content: string }[]): Issue[] {
  const issues: Issue[] = [];
  for (const { path: fpath, content } of files) {
    const lines = content.split("\n");

    // Entire lodash import
    if (content.match(/import\s+\*\s+as\s+_\s+from\s+['"]lodash['"]/) || content.match(/import\s+_?\s+from\s+['"]lodash['"]/))
      issues.push(mk("bundle","Entire lodash imported","Importing all of lodash ships ~70KB to client.",fpath,fl(lines,"lodash"),"Use 'import debounce from lodash/debounce' or switch to es-toolkit.","high","trivial"));

    // N+1 query — findMany inside map
    if (content.match(/\.map\s*\(.*(?:await\s+)?(?:db|prisma)\./))
      issues.push(mk("query","N+1 query pattern","Database query inside .map() — each iteration hits the DB.",fpath,fl(lines,".map"),"Batch with a single findMany({ where: { id: { in } } }) or use includes().","medium","medium"));

    // Missing memoization — expensive calc in render
    if (content.match(/\.sort\s*\(/)||content.match(/\.filter\s*\(/)||content.match(/\.reduce\s*\(/)) {
      if (content.includes("return (")||content.includes("=> (")) {
        const ln = fl(lines,"sort|filter|reduce");
        if (!lines.slice(Math.max(0,ln-5),ln).some(l=>l.includes("useMemo")||l.includes("useCallback")))
          issues.push(mk("render","Expensive computation in render","Array sort/filter/reduce in render without useMemo.",fpath,ln,"Wrap in useMemo with proper dependencies.","medium","small"));
      }
    }

    // Large bundle — moment.js
    if (content.includes("moment"))
      issues.push(mk("bundle","moment.js is very large","moment.js adds ~230KB to bundle.",fpath,fl(lines,"moment"),"Use date-fns or day.js (2KB) instead.","high","medium"));

    // Missing key in list
    if (content.match(/\.map\s*\(/)&&!content.includes("key=")&&!content.includes("key:"))
      issues.push(mk("render","Missing key in list render","React list without key prop causes re-render inefficiency.",fpath,fl(lines,".map"),"Add key={item.id} to each list item.","low","trivial"));

    // Inline function in props
    const inlineCount = (content.match(/onClick\s*=\s*\{/g)||[]).length;
    if (inlineCount > 3)
      issues.push(mk("render","Many inline handlers","Multiple inline onClick handlers cause child re-renders.",fpath,1,"Extract to useCallback or define outside render.","low","medium"));

    // Missing pagination — loading all records
    if (content.match(/findMany\s*\(\s*\)/)&&!content.includes("take:")&&!content.includes("skip:"))
      issues.push(mk("query","Unbounded query — no pagination","findMany without take/skip loads all records.",fpath,fl(lines,"findMany"),"Add take/skip for pagination: findMany({ take: 20, skip: page*20 })","medium","small"));

    // Sync file operation in request handler
    if (content.match(/readFileSync|writeFileSync/i)&&content.match(/app\.(get|post)|router\./))
      issues.push(mk("blocking","Sync file I/O in request handler","readFileSync blocks the event loop.",fpath,fl(lines,"readFileSync|writeFileSync"),"Use async fs.promises.readFile instead.","high","small"));

    // regex in render
    if (content.match(/new RegExp\s*\(/)&&content.includes("return"))
      issues.push(mk("render","RegExp constructed in render","Creating RegExp in render is expensive.",fpath,fl(lines,"new RegExp"),"Move RegExp construction outside component or useMemo.","low","trivial"));
  }
  return issues;
}
function fl(lines:string[],pat:string):number{const r=new RegExp(pat,"i");for(let i=0;i<lines.length;i++)if(r.test(lines[i]))return i+1;return 1;}
function mk(c:string,t:string,d:string,f:string,l:number,r:string,s:Issue["severity"],e:Issue["effort"]):Issue{return{id:`perf_${Math.random().toString(36).slice(2,9)}`,severity:s,category:c,title:t,description:d,file:f,line:l,recommendation:r,effort:e};}
