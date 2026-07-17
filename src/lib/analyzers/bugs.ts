// CodeInsight AI — Bug Analyzer
import type { Issue } from "../types";

export function analyzeBugs(files: { path: string; content: string }[]): Issue[] {
  const issues: Issue[] = [];
  for (const { path: fpath, content } of files) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Null reference — accessing .id / .name without null check on ctx/user
      if (line.match(/ctx\.user\.(id|name|role|email)/) && !lines.slice(Math.max(0,i-3),i+1).some(l=>l.includes("if")||l.includes("?")||l.includes("throw")))
        issues.push(mk("null-ref","Potential null dereference",`ctx.user accessed without null check at line ${i+1}.`,fpath,i+1,"Guard: if(!ctx.user) throw new Error('UNAUTHORIZED')","high","small"));

      // Missing dependency array in useEffect
      if (line.match(/useEffect\s*\(/)&&!lines.slice(i,i+10).some(l=>l.match(/\],\s*\[/)))
        issues.push(mk("hooks","Missing useEffect dependency array","useEffect without dependency array runs on every render.",fpath,i+1,"Add dependency array: useEffect(fn, [deps])","medium","trivial"));

      // Async state update after unmount
      if (line.match(/useEffect\s*\(.*async/)&&!lines.slice(i,i+15).some(l=>l.includes("AbortController")||l.includes("mounted")||l.includes("cancelled")||l.includes("ignore")))
        issues.push(mk("race","Async state update after unmount","async useEffect may set state after unmount.",fpath,i+1,"Use AbortController or a mounted flag.","medium","small"));

      // Promise without catch
      if (line.match(/\.then\s*\(/)&&!lines.slice(i,i+5).some(l=>l.includes(".catch")||l.includes("try")||l.includes("await")))
        issues.push(mk("promise","Unhandled promise rejection","Promise chain without .catch().",fpath,i+1,"Add .catch() or use try/await/catch.","medium","trivial"));

      // == instead of ===
      if (line.match(/[^=!<>]==[^=]/)&&!line.includes("typeof")&&!line.includes("=="))
        issues.push(mk("equality","Loose equality (==)","== does type coercion, may cause bugs.",fpath,i+1,"Use === for strict equality.","low","trivial"));

      // console.log in production
      if (line.match(/console\.(log|debug)\s*\(/)&&!fpath.includes(".test.")&&!fpath.includes(".spec."))
        issues.push(mk("debug","console.log in production code","console.log left in production code.",fpath,i+1,"Remove or replace with a proper logger.","low","trivial"));

      // var instead of let/const
      if (line.match(/\bvar\s+/))
        issues.push(mk("modern","var instead of let/const","var has function scope, not block scope.",fpath,i+1,"Use let or const.","low","trivial"));

      // Empty catch block
      if (line.match(/catch\s*\([^)]*\)\s*\{/) && (i+1<lines.length) && lines[i+1].trim()==="}")
        issues.push(mk("exception","Empty catch block","Error silently swallowed.",fpath,i+1,"Log or rethrow the error.","medium","trivial"));

      // Missing await
      if (line.match(/\bawait\s+/) && lines[i-1] && lines[i-1].match(/return\s+/) && !lines[i-1].includes("await"))
        issues.push(mk("async","Missing await before async call","Async function called without await — promise may not resolve.",fpath,i,"Add await keyword.","medium","small"));
    }

    // Infinite loop detection — while(true) without break
    if (content.match(/while\s*\(\s*true\s*\)/)) {
      const whileLine = fl(lines,"while.*true");
      if (!lines.slice(whileLine-1, whileLine+20).some(l=>l.includes("break")||l.includes("return")))
        issues.push(mk("infinite","Potential infinite loop","while(true) without break/return.",fpath,whileLine,"Add a break condition or limit iterations.","high","medium"));
    }

    // Unused variables (simplified — const/let never referenced again)
    const varMatches = [...content.matchAll(/(?:const|let)\s+(\w+)\s*=/g)];
    for (const vm of varMatches) {
      const varName = vm[1];
      if (["module","exports","process","console"].includes(varName)) continue;
      const rest = content.substring(vm.index! + vm[0].length);
      if (!rest.includes(varName)) {
        const ln = content.substring(0, vm.index).split("\n").length;
        issues.push(mk("unused",`Unused variable: ${varName}`,`'${varName}' is declared but never used.`,fpath,ln,"Remove the unused variable or prefix with _ if intentional.","low","trivial"));
      }
    }
  }
  return issues;
}
function fl(lines:string[],pat:string):number{const r=new RegExp(pat,"i");for(let i=0;i<lines.length;i++)if(r.test(lines[i]))return i+1;return 1;}
function mk(c:string,t:string,d:string,f:string,l:number,r:string,s:Issue["severity"],e:Issue["effort"]):Issue{return{id:`bug_${Math.random().toString(36).slice(2,9)}`,severity:s,category:c,title:t,description:d,file:f,line:l,recommendation:r,effort:e};}
