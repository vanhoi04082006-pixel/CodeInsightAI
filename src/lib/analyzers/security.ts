// CodeInsight AI — Security Analyzer
import type { Issue } from "../types";

export function analyzeSecurity(files: { path: string; content: string }[]): Issue[] {
  const issues: Issue[] = [];
  for (const { path: fpath, content } of files) {
    const lines = content.split("\n");
    // 1. Hardcoded secrets
    const secretPats = [
      { re: /sk-[a-zA-Z0-9]{20,}/g, l: "Hardcoded OpenAI API key", s: "critical" as const },
      { re: /sk-ant-[a-zA-Z0-9]{20,}/g, l: "Hardcoded Anthropic API key", s: "critical" as const },
      { re: /ghp_[a-zA-Z0-9]{36}/g, l: "Hardcoded GitHub PAT", s: "critical" as const },
      { re: /AIza[a-zA-Z0-9_-]{35}/g, l: "Hardcoded Google API key", s: "critical" as const },
      { re: /AKIA[A-Z0-9]{16}/g, l: "Hardcoded AWS access key", s: "critical" as const },
      { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, l: "Embedded private key", s: "critical" as const },
    ];
    for (const { re, l, s } of secretPats) {
      let m; while ((m = re.exec(content)) !== null) {
        const ln = content.substring(0, m.index).split("\n").length;
        issues.push(mk("secrets", l, `${l} found in ${fpath}. Credential exposed in source code and git history.`, fpath, ln, "Move to env var and rotate immediately. Add pre-commit secret scanner.", s, "trivial"));
      }
    }
    // 2. Credential in assignment
    for (let i = 0; i < lines.length; i++) {
      if (/(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'][^"']{4,}["']/i.test(lines[i]) && !/process\.env/.test(lines[i]))
        issues.push(mk("secrets","Hardcoded credential in assignment",`Credential assigned as literal at line ${i+1}.`,fpath,i+1,"Use process.env for all credentials.","high","trivial"));
    }
    // 3. JWT issues
    if (content.includes("jwt")||content.includes("jsonwebtoken")) {
      if (content.match(/jwt\.sign\s*\([^,]+,\s*["'][^"']+["']/))
        issues.push(mk("jwt","JWT signed with hardcoded secret","JWT signed with literal string.",fpath,fl(lines,"jwt.sign"),"Use process.env.JWT_SECRET.","high","small"));
      if (content.match(/algorith(?:m|ms)\s*:\s*["']none["']/i))
        issues.push(mk("jwt","JWT 'none' algorithm","'none' algorithm bypasses signature verification.",fpath,fl(lines,"none"),"Specify allowed algorithms (HS256, RS256). Never accept 'none'.","critical","small"));
    }
    // 4. Weak hashing
    if (content.includes("md5")&&!content.includes("import"))
      issues.push(mk("hashing","Weak MD5 hashing","MD5 is cryptographically broken.",fpath,fl(lines,"md5"),"Migrate to bcrypt/argon2 with work factor >= 12.","medium","medium"));
    // 5. SQL Injection
    if (content.match(/\$\{.*\}.*SELECT|INSERT|UPDATE|DELETE/i)||content.match(/query\s*\(\s*["'`].*\$\{/i))
      issues.push(mk("sqli","Potential SQL Injection","User input interpolated into SQL query.",fpath,fl(lines,"SELECT|INSERT|UPDATE|DELETE"),"Use parameterized queries. Never interpolate user input.","critical","medium"));
    // 6. Command Injection
    if (content.match(/(?:exec|execSync|spawn)\s*\(\s*.*\$\{/i))
      issues.push(mk("cmdi","Potential Command Injection","User input in shell command.",fpath,fl(lines,"exec|spawn"),"Use execFile with argument array.","critical","medium"));
    // 7. Path Traversal
    if (content.match(/readFile|readFileSync|writeFile/i)&&content.includes("../"))
      issues.push(mk("traversal","Potential Path Traversal","Path includes '../'.",fpath,fl(lines,"readFile|writeFile"),"Validate paths with path.resolve(). Verify within allowed dir.","high","medium"));
    // 8. SSRF
    if (content.match(/fetch\s*\(\s*.*req\./i)||content.match(/axios\.(get|post)\s*\(\s*.*req\./i))
      issues.push(mk("ssrf","Potential SSRF","Server-side request with user-controlled URL.",fpath,fl(lines,"fetch|axios"),"Validate URLs against allowlist. Block internal IPs.","high","medium"));
    // 9. XSS
    if (content.includes("dangerouslySetInnerHTML"))
      issues.push(mk("xss","Unescaped HTML via dangerouslySetInnerHTML","Bypasses React XSS protection.",fpath,fl(lines,"dangerouslySetInnerHTML"),"Sanitize with DOMPurify before rendering.","high","medium"));
    // 10. Unsafe eval
    if (content.match(/\beval\s*\(/)&&!content.includes("eslint"))
      issues.push(mk("eval","Unsafe eval() usage","eval() executes arbitrary code.",fpath,fl(lines,"eval"),"Replace with JSON.parse or safe alternative.","high","medium"));
    // 11. Open Redirect
    if (content.match(/redirect\s*\(\s*.*req\.(query|body|params)/i))
      issues.push(mk("redirect","Potential Open Redirect","Redirect URL from user input.",fpath,fl(lines,"redirect"),"Validate against allowlist of trusted domains.","medium","trivial"));
    // 12. CORS wildcard
    if (content.match(/origin\s*:\s*["']\*["']/i))
      issues.push(mk("cors","Wildcard CORS origin","CORS allows all origins.",fpath,fl(lines,"origin"),"Restrict to specific trusted origins.","medium","trivial"));
  }
  return issues;
}
function fl(lines:string[],pat:string):number{const r=new RegExp(pat,"i");for(let i=0;i<lines.length;i++)if(r.test(lines[i]))return i+1;return 1;}
function mk(c:string,t:string,d:string,f:string,l:number,r:string,s:Issue["severity"],e:Issue["effort"]):Issue{return{id:`sec_${Math.random().toString(36).slice(2,9)}`,severity:s,category:c,title:t,description:d,file:f,line:l,recommendation:r,effort:e};}
