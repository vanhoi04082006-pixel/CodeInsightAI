// CodeInsight AI — Bug Analyzer
import type { Issue } from "../types";
import { translateIssue } from "../issues-i18n";

export function analyzeBugs(files: { path: string; content: string }[], language: string = "en"): Issue[] {
  const issues: Issue[] = [];
  const t = (key: string, vars?: Record<string, string | number>) => translateIssue(language, key, vars);
  for (const { path: fpath, content } of files) {
    const lines = content.split("\n");
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

      // console.log in production
      if (line.match(/console\.(log|debug)\s*\(/)&&!fpath.includes(".test.")&&!fpath.includes(".spec."))
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
function fl(lines:string[],pat:string):number{const r=new RegExp(pat,"i");for(let i=0;i<lines.length;i++)if(r.test(lines[i]))return i+1;return 1;}
function mk(c:string,t:string,d:string,f:string,l:number,r:string,s:Issue["severity"],e:Issue["effort"]):Issue{return{id:`bug_${Math.random().toString(36).slice(2,9)}`,severity:s,category:c,title:t,description:d,file:f,line:l,recommendation:r,effort:e};}
