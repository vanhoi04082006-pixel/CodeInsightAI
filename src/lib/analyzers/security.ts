// CodeInsight AI — Security Analyzer
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

export function analyzeSecurity(files: { path: string; content: string }[], language: string = "en"): Issue[] {
  const issues: Issue[] = [];
  const t = (key: string, vars?: Record<string, string | number>) => translateIssue(language, key, vars);
  for (const { path: fpath, content } of files) {
    const lines = content.split("\n");
    for (const r of SECURITY_EXTRA_RULES) {
      if (r.file && !r.file.test(fpath)) continue;
      if (r.neg && r.neg.test(content)) continue;
      if (!r.re.test(content)) continue;
      const ln = fl(lines, r.re.source);
      issues.push(mk(
        r.cat,
        t(`security.${r.key}.title`),
        t(`security.${r.key}.description`, { file: fpath }),
        fpath, ln,
        t(`security.${r.key}.recommendation`),
        r.sev, r.eff,
      ));
    }
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
/** Additional multi-language security rules (77 → security total 90). */
export const SECURITY_EXTRA_RULES: ExtraRule[] = [
  // ── Cloud / provider secrets ──
  { key: "hardcodedStripeKey", sev: "critical", cat: "secrets", eff: "trivial", re: /sk_live_[0-9a-zA-Z]{16,}/ },
  { key: "hardcodedSlackToken", sev: "critical", cat: "secrets", eff: "trivial", re: /xox[baprs]-[0-9a-zA-Z-]{10,}/ },
  { key: "hardcodedTwilioSid", sev: "critical", cat: "secrets", eff: "trivial", re: /AC[0-9a-f]{32}/ },
  { key: "hardcodedTelegramToken", sev: "high", cat: "secrets", eff: "trivial", re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
  { key: "hardcodedDiscordToken", sev: "high", cat: "secrets", eff: "trivial", re: /(?:M|N)[A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{25,}/ },
  { key: "hardcodedNpmToken", sev: "critical", cat: "secrets", eff: "trivial", re: /npm_[0-9a-zA-Z]{36}/ },
  { key: "hardcodedSendGridKey", sev: "critical", cat: "secrets", eff: "trivial", re: /SG\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z_-]{43}/ },
  { key: "hardcodedAzureStorageKey", sev: "critical", cat: "secrets", eff: "trivial", re: /AccountKey=[A-Za-z0-9+/=]{40,}/ },
  { key: "gcpServiceAccountKey", sev: "high", cat: "secrets", eff: "trivial", re: /"type"\s*:\s*"service_account"/, file: /\.json$/ },
  // ── Connection strings with credentials ──
  { key: "postgresUrlWithCreds", sev: "critical", cat: "secrets", eff: "trivial", re: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/ },
  { key: "mongoUrlWithCreds", sev: "critical", cat: "secrets", eff: "trivial", re: /mongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@/ },
  { key: "redisUrlWithCreds", sev: "critical", cat: "secrets", eff: "trivial", re: /redis:\/\/[^:\s]+:[^@\s]+@/ },
  { key: "mysqlUrlWithCreds", sev: "critical", cat: "secrets", eff: "trivial", re: /mysql:\/\/[^:\s]+:[^@\s]+@/ },
  { key: "sessionSecretAssignment", sev: "critical", cat: "secrets", eff: "trivial", re: /(?:JWT_SECRET|SESSION_SECRET|COOKIE_SECRET)\s*=\s*["'][^"']/ },
  { key: "basicAuthHeader", sev: "high", cat: "secrets", eff: "trivial", re: /Authorization\s*:\s*Basic\s+[A-Za-z0-9+/=]{20,}/ },
  { key: "credsInGitUrl", sev: "high", cat: "secrets", eff: "small", re: /(?:https?:\/\/|git@)[^/\s]+:[^@\s]+@/ },
  // ── Injection (multi-language) ──
  { key: "pythonFStringSql", sev: "critical", cat: "sqli", eff: "medium", re: /f["'][^"']*(?:SELECT|INSERT|UPDATE|DELETE)[^"']*\{[^}]*\}/, file: /\.py$/ },
  { key: "phpSqlConcat", sev: "critical", cat: "sqli", eff: "medium", re: /["'][^"']*(?:SELECT|INSERT|UPDATE|DELETE)[^"']*["']\s*\.\s*\$/, file: /\.php$/ },
  { key: "javaSqlConcat", sev: "critical", cat: "sqli", eff: "medium", re: /["][^"]*(?:SELECT|INSERT|UPDATE|DELETE)[^"]*["]\s*\+/, file: /\.java$/ },
  { key: "goSprintfSql", sev: "critical", cat: "sqli", eff: "medium", re: /fmt\.Sprintf\s*\(\s*["'][^"']*(?:SELECT|INSERT|UPDATE|DELETE)/, file: /\.go$/ },
  { key: "pythonOsSystem", sev: "critical", cat: "cmdi", eff: "small", re: /os\.system\s*\(/, file: /\.py$/ },
  { key: "pythonSubprocessShell", sev: "critical", cat: "cmdi", eff: "small", re: /subprocess\.(?:call|Popen|run)\([^)]*shell\s*=\s*True/, file: /\.py$/ },
  { key: "javaRuntimeExec", sev: "critical", cat: "cmdi", eff: "small", re: /Runtime\.getRuntime\(\)\.exec\s*\(/, file: /\.java$/ },
  { key: "phpShellExec", sev: "critical", cat: "cmdi", eff: "small", re: /(?:shell_exec|passthru|system)\s*\(/, file: /\.php$/ },
  { key: "nodeChildProcessExec", sev: "critical", cat: "cmdi", eff: "small", re: /child_process\.(?:exec|execSync|spawn)\s*\(/ },
  { key: "goExecCommand", sev: "high", cat: "cmdi", eff: "small", re: /exec\.Command\s*\(/, file: /\.go$/ },
  { key: "templateInjectionPy", sev: "critical", cat: "sqli", eff: "medium", re: /render_template_string\s*\(/, file: /\.py$/ },
  // ── XSS (multi-framework) ──
  { key: "domInnerHtmlXss", sev: "high", cat: "xss", eff: "medium", re: /\.innerHTML\s*=\s*[^"'\d]/ },
  { key: "domOuterHtmlXss", sev: "high", cat: "xss", eff: "medium", re: /\.outerHTML\s*=\s*[^"'\d]/ },
  { key: "insertAdjacentHtmlXss", sev: "high", cat: "xss", eff: "medium", re: /\.insertAdjacentHTML\s*\(/ },
  { key: "documentWriteXss", sev: "critical", cat: "xss", eff: "medium", re: /document\.write\s*\(/ },
  { key: "vueVHtmlXss", sev: "high", cat: "xss", eff: "medium", re: /v-html\s*=\s*["']?[^"']/, file: /\.(vue|html)$/ },
  { key: "angularInnerHtmlXss", sev: "high", cat: "xss", eff: "medium", re: /\[innerHTML\]\s*=\s*/, file: /\.html$/ },
  { key: "javascriptHrefXss", sev: "critical", cat: "xss", eff: "medium", re: /href\s*=\s*["']javascript:/ },
  // ── Crypto & auth ──
  { key: "weakSha1", sev: "high", cat: "hashing", eff: "medium", re: /\bsha1\s*\(|hashlib\.sha1/, neg: /import sha1/ },
  { key: "weakDes", sev: "critical", cat: "hashing", eff: "medium", re: /CryptoJS\.DES|DES\.encrypt|3DES/ },
  { key: "weakRc4", sev: "critical", cat: "hashing", eff: "medium", re: /\bRC4\b|ARC4/ },
  { key: "weakEcbMode", sev: "critical", cat: "hashing", eff: "medium", re: /AES\/ECB|ECBMode|Cipher\.getInstance\("AES\/ECB/ },
  { key: "hardcodedSalt", sev: "medium", cat: "hashing", eff: "small", re: /salt\s*=\s*["'][^"']{4,}/ },
  { key: "hardcodedIv", sev: "medium", cat: "hashing", eff: "small", re: /\biv\s*=\s*["'][^"']{4,}/ },
  { key: "weakRandomForSecret", sev: "high", cat: "hashing", eff: "small", re: /(?:token|password|secret|apiKey|otp)[^;]{0,40}Math\.random|Math\.random[^;]{0,40}(?:token|password|secret|otp)/ },
  { key: "pythonWeakRandomForSecret", sev: "high", cat: "hashing", eff: "small", re: /(?:token|password|secret|otp)[^;\n]{0,40}random\.(?:randint|choice|random)\s*\(/, file: /\.py$/ },
  { key: "jwtWeakSecret", sev: "critical", cat: "jwt", eff: "small", re: /jwt\.sign\s*\([^)]*["'][^"']{1,10}["']/ },
  { key: "cookieNoHttpOnly", sev: "high", cat: "auth", eff: "trivial", re: /httpOnly\s*:\s*false|HttpOnly\s*=\s*false/ },
  { key: "cookieNoSecure", sev: "high", cat: "auth", eff: "trivial", re: /secure\s*:\s*false/ },
  { key: "cookieSameSiteNone", sev: "medium", cat: "auth", eff: "trivial", re: /sameSite\s*:\s*["']none["']/ },
  { key: "rejectUnauthorizedFalse", sev: "critical", cat: "tls", eff: "trivial", re: /rejectUnauthorized\s*:\s*false/ },
  { key: "sslVerifyDisabled", sev: "critical", cat: "tls", eff: "trivial", re: /verify\s*=\s*False|ssl\s*=\s*False|CURLOPT_SSL_VERIFYPEER\s*,\s*false/ },
  { key: "timingUnsafeCompare", sev: "medium", cat: "crypto", eff: "small", re: /(?:hash|signature|expectedHash|expectedSignature)\s*[=!]==?\s*[^;\n]{0,40}/ },
  // ── Deserialization & XXE ──
  { key: "pickleLoads", sev: "critical", cat: "deserialization", eff: "medium", re: /pickle\.loads\s*\(/, file: /\.py$/ },
  { key: "yamlLoadUnsafe", sev: "critical", cat: "deserialization", eff: "medium", re: /yaml\.load\s*\(/, file: /\.py$/, neg: /yaml\.safe_load/ },
  { key: "phpUnserialize", sev: "critical", cat: "deserialization", eff: "medium", re: /unserialize\s*\(/, file: /\.php$/ },
  { key: "javaObjectInputStream", sev: "critical", cat: "deserialization", eff: "medium", re: /ObjectInputStream|readObject\s*\(/, file: /\.java$/ },
  { key: "dotnetBinaryFormatter", sev: "critical", cat: "deserialization", eff: "medium", re: /BinaryFormatter|FormatterServices/, file: /\.cs$/ },
  { key: "xxeResolveEntities", sev: "critical", cat: "xxe", eff: "medium", re: /resolve_entities\s*=\s*True/, file: /\.py$/ },
  { key: "xxeDtdProcessing", sev: "high", cat: "xxe", eff: "medium", re: /DtdProcessing\s*=\s*Parse|SetFeature\([^)]*DOCTYPE|external-entities/ },
  { key: "prototypePollution", sev: "high", cat: "misc", eff: "medium", re: /["']__proto__["']|__proto__\s*\[|constructor\.prototype/ },
  { key: "sqlNoParameterized", sev: "critical", cat: "sqli", eff: "medium", re: /(?:execute|query)\s*\(\s*["'][^"']*(?:%s|%\()/, file: /\.py$/ },
  // ── Path / SSRF / redirect / upload ──
  { key: "pathTraversalJoin", sev: "high", cat: "traversal", eff: "small", re: /path\.join\s*\(\s*[^)]*req\.|__dirname\s*,\s*req\./ },
  { key: "openRedirectGeneric", sev: "high", cat: "redirect", eff: "trivial", re: /res\.redirect\s*\(\s*[^)]*req\./ },
  { key: "uploadNoSizeLimit", sev: "high", cat: "upload", eff: "medium", re: /upload\.single\s*\(|upload\.array\s*\(/, file: /\.(js|ts|mjs|tsx)$/, neg: /limits|fileSize|maxSize|MAX_FILE_SIZE/ },
  // ── Misc unsafe patterns ──
  { key: "newFunctionEval", sev: "high", cat: "eval", eff: "small", re: /new\s+Function\s*\(/ },
  { key: "curlInsecure", sev: "high", cat: "tls", eff: "trivial", re: /curl_setopt\s*\([^)]*CURLOPT_SSL_VERIFYPEER\s*,\s*false|curl\s+[^|\n]*\s-k\b/ },
  { key: "secretInLogs", sev: "high", cat: "secrets", eff: "trivial", re: /console\.(?:log|info|debug)\s*\([^)]*(?:token|password|secret|apiKey|authorization)/ },
  { key: "hardcodedAdminCreds", sev: "high", cat: "secrets", eff: "trivial", re: /admin\s*[:=]\s*["'](?:admin|password)["']/ },
  { key: "dockerPrivileged", sev: "high", cat: "misc", eff: "small", re: /--privileged|privileged:\s*true/, file: /\.(yml|yaml|sh|dockerfile)$/i },
  { key: "chmod777", sev: "medium", cat: "misc", eff: "trivial", re: /chmod\s+777|0o777/, file: /\.(sh|py|js|ts)$/ },
  { key: "oldTlsProtocol", sev: "medium", cat: "tls", eff: "small", re: /TLSv1[01]|SSLv3|PROTOCOL_TLSv1[,)]/ },
  { key: "sshPrivateKey", sev: "critical", cat: "secrets", eff: "trivial", re: /-----BEGIN OPENSSH PRIVATE KEY-----/ },
  { key: "mongoNoSQLInjection", sev: "critical", cat: "sqli", eff: "medium", re: /\$where\s*:|\$regex\s*:/, file: /\.(js|ts|mjs|tsx)$/ },
  { key: "jwtNoExpiry", sev: "medium", cat: "jwt", eff: "trivial", re: /\bjwt\.sign\s*\(/, neg: /expiresIn|exp\s*:/ },
  { key: "headerInjection", sev: "critical", cat: "cmdi", eff: "medium", re: /(?:setHeader|writeHead)\s*\([^)]*(?:\\r|\\n)/ },
  { key: "phpFileInclusion", sev: "critical", cat: "traversal", eff: "medium", re: /(?:include|include_once|require|require_once)\s*\(\s*\$_(?:GET|POST|REQUEST)/, file: /\.php$/ },
  { key: "execSyncTemplate", sev: "critical", cat: "cmdi", eff: "small", re: /execSync\s*\(\s*`[^`]*\$\{/ },
  { key: "xmlExternalEntity", sev: "critical", cat: "xxe", eff: "medium", re: /<!\s*DOCTYPE[^>]*SYSTEM/, file: /\.(xml|php|svg)$/ },
  { key: "sessionCookieNoSecureFlag", sev: "high", cat: "auth", eff: "trivial", re: /session\.cookie\.(?:httpOnly|secure)\s*=\s*false/ },
  { key: "sqlRawConcatJs", sev: "critical", cat: "sqli", eff: "medium", re: /(?:\.query|\.execute)\(\s*["'`][^"'`]*["'`]\s*\+/ },
];

function fl(lines:string[],pat:string):number{const r=new RegExp(pat,"i");for(let i=0;i<lines.length;i++)if(r.test(lines[i]))return i+1;return 1;}
function mk(c:string,t:string,d:string,f:string,l:number,r:string,s:Issue["severity"],e:Issue["effort"]):Issue{return{id:`sec_${Math.random().toString(36).slice(2,9)}`,severity:s,category:c,title:t,description:d,file:f,line:l,recommendation:r,effort:e};}
