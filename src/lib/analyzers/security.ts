// CodeInsight AI — Security Analyzer
import type { Issue } from "../types";
import { translateIssue } from "../issues-i18n";

export function analyzeSecurity(files: { path: string; content: string }[], language: string = "en"): Issue[] {
  const issues: Issue[] = [];
  const t = (key: string, vars?: Record<string, string | number>) => translateIssue(language, key, vars);
  for (const { path: fpath, content } of files) {
    const lines = content.split("\n");
    // 1. Hardcoded secrets
    const secretPats: { re: RegExp; key: string; s: Issue["severity"] }[] = [
      { re: /sk-[a-zA-Z0-9]{20,}/g, key: "hardcodedOpenAIKey", s: "critical" },
      { re: /sk-ant-[a-zA-Z0-9]{20,}/g, key: "hardcodedAnthropicKey", s: "critical" },
      { re: /ghp_[a-zA-Z0-9]{36}/g, key: "hardcodedGitHubPat", s: "critical" },
      { re: /AIza[a-zA-Z0-9_-]{35}/g, key: "hardcodedGoogleKey", s: "critical" },
      { re: /AKIA[A-Z0-9]{16}/g, key: "hardcodedAWSKey", s: "critical" },
      { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, key: "embeddedPrivateKey", s: "critical" },
    ];
    for (const { re, key, s } of secretPats) {
      let m; while ((m = re.exec(content)) !== null) {
        const ln = content.substring(0, m.index).split("\n").length;
        issues.push(mk(
          "secrets",
          t(`security.${key}.title`),
          t(`security.${key}.description`, { file: fpath }),
          fpath, ln,
          t(`security.${key}.recommendation`),
          s, "trivial",
        ));
      }
    }
    // 2. Credential in assignment
    for (let i = 0; i < lines.length; i++) {
      if (/(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'][^"']{4,}["']/i.test(lines[i]) && !/process\.env/.test(lines[i]))
        issues.push(mk(
          "secrets",
          t("security.hardcodedCred.title"),
          t("security.hardcodedCred.description", { line: i + 1 }),
          fpath, i + 1,
          t("security.hardcodedCred.recommendation"),
          "high", "trivial",
        ));
    }
    // 3. JWT issues
    if (content.includes("jwt")||content.includes("jsonwebtoken")) {
      if (content.match(/jwt\.sign\s*\([^,]+,\s*["'][^"']+["']/))
        issues.push(mk(
          "jwt",
          t("security.jwtHardcodedSecret.title"),
          t("security.jwtHardcodedSecret.description"),
          fpath, fl(lines,"jwt.sign"),
          t("security.jwtHardcodedSecret.recommendation"),
          "high", "small",
        ));
      if (content.match(/algorith(?:m|ms)\s*:\s*["']none["']/i))
        issues.push(mk(
          "jwt",
          t("security.jwtNoneAlgorithm.title"),
          t("security.jwtNoneAlgorithm.description"),
          fpath, fl(lines,"none"),
          t("security.jwtNoneAlgorithm.recommendation"),
          "critical", "small",
        ));
    }
    // 4. Weak hashing
    if (content.includes("md5")&&!content.includes("import"))
      issues.push(mk(
        "hashing",
        t("security.weakMd5.title"),
        t("security.weakMd5.description"),
        fpath, fl(lines,"md5"),
        t("security.weakMd5.recommendation"),
        "medium", "medium",
      ));
    // 5. SQL Injection
    if (content.match(/\$\{.*\}.*SELECT|INSERT|UPDATE|DELETE/i)||content.match(/query\s*\(\s*["'`].*\$\{/i))
      issues.push(mk(
        "sqli",
        t("security.sqlInjection.title"),
        t("security.sqlInjection.description"),
        fpath, fl(lines,"SELECT|INSERT|UPDATE|DELETE"),
        t("security.sqlInjection.recommendation"),
        "critical", "medium",
      ));
    // 6. Command Injection
    if (content.match(/(?:exec|execSync|spawn)\s*\(\s*.*\$\{/i))
      issues.push(mk(
        "cmdi",
        t("security.commandInjection.title"),
        t("security.commandInjection.description"),
        fpath, fl(lines,"exec|spawn"),
        t("security.commandInjection.recommendation"),
        "critical", "medium",
      ));
    // 7. Path Traversal
    if (content.match(/readFile|readFileSync|writeFile/i)&&content.includes("../"))
      issues.push(mk(
        "traversal",
        t("security.pathTraversal.title"),
        t("security.pathTraversal.description"),
        fpath, fl(lines,"readFile|writeFile"),
        t("security.pathTraversal.recommendation"),
        "high", "medium",
      ));
    // 8. SSRF
    if (content.match(/fetch\s*\(\s*.*req\./i)||content.match(/axios\.(get|post)\s*\(\s*.*req\./i))
      issues.push(mk(
        "ssrf",
        t("security.ssrf.title"),
        t("security.ssrf.description"),
        fpath, fl(lines,"fetch|axios"),
        t("security.ssrf.recommendation"),
        "high", "medium",
      ));
    // 9. XSS
    if (content.includes("dangerouslySetInnerHTML"))
      issues.push(mk(
        "xss",
        t("security.xssDangerouslySetInnerHTML.title"),
        t("security.xssDangerouslySetInnerHTML.description"),
        fpath, fl(lines,"dangerouslySetInnerHTML"),
        t("security.xssDangerouslySetInnerHTML.recommendation"),
        "high", "medium",
      ));
    // 10. Unsafe eval
    if (content.match(/\beval\s*\(/)&&!content.includes("eslint"))
      issues.push(mk(
        "eval",
        t("security.unsafeEval.title"),
        t("security.unsafeEval.description"),
        fpath, fl(lines,"eval"),
        t("security.unsafeEval.recommendation"),
        "high", "medium",
      ));
    // 11. Open Redirect
    if (content.match(/redirect\s*\(\s*.*req\.(query|body|params)/i))
      issues.push(mk(
        "redirect",
        t("security.openRedirect.title"),
        t("security.openRedirect.description"),
        fpath, fl(lines,"redirect"),
        t("security.openRedirect.recommendation"),
        "medium", "trivial",
      ));
    // 12. CORS wildcard
    if (content.match(/origin\s*:\s*["']\*["']/i))
      issues.push(mk(
        "cors",
        t("security.corsWildcard.title"),
        t("security.corsWildcard.description"),
        fpath, fl(lines,"origin"),
        t("security.corsWildcard.recommendation"),
        "medium", "trivial",
      ));
  }
  return issues;
}
function fl(lines:string[],pat:string):number{const r=new RegExp(pat,"i");for(let i=0;i<lines.length;i++)if(r.test(lines[i]))return i+1;return 1;}
function mk(c:string,t:string,d:string,f:string,l:number,r:string,s:Issue["severity"],e:Issue["effort"]):Issue{return{id:`sec_${Math.random().toString(36).slice(2,9)}`,severity:s,category:c,title:t,description:d,file:f,line:l,recommendation:r,effort:e};}
