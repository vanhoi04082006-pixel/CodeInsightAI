// CodeInsight AI — Skill Definitions (Layer 8)
// 10 skills converted from existing agents (src/lib/agents/*.ts).
// Each skill wraps an existing agent's logic via systemPrompt + capabilities.

import type { Skill } from "../../contracts";

// ─── 1. Bug Fix Skill (from BugFixerAgent) ───
export const bugFixSkill: Skill = {
  name: "bug-fix",
  description: "Fix bugs by analyzing root cause, generating patch, and verifying",
  systemPrompt: "You are a Bug Fixer. Analyze the bug, find root cause, generate a patch, and verify with lint + type-check. Use tools to search code, find issues, and apply fixes.",
  capabilities: ["find-symbol", "find-issues", "search-code", "open-file", "find-references", "find-call-chain", "generate-patch", "apply-patch", "run-lint", "rollback-changes"],
  triggerKeywords: ["fix bug", "bug", "fix", "broken", "error", "crash", "exception", "fail", "incorrect", "wrong"],
  defaultPlanTemplate: {
    steps: [
      { capability: "find-issues", description: "Find relevant issues", parallelGroup: "discover" },
      { capability: "search-code", description: "Search for related code", parallelGroup: "discover" },
      { capability: "open-file", description: "Open the buggy file", dependsOn: [0] },
      { capability: "find-call-chain", description: "Trace call chain", dependsOn: [2] },
      { capability: "generate-patch", description: "Generate fix patch", dependsOn: [3] },
      { capability: "apply-patch", description: "Apply the patch", dependsOn: [4] },
      { capability: "run-lint", description: "Verify with lint", dependsOn: [5] },
    ],
  },
};

// ─── 2. Security Audit Skill (from SecurityAgent) ───
export const securityAuditSkill: Skill = {
  name: "security-audit",
  description: "Audit security vulnerabilities and suggest fixes",
  systemPrompt: "You are a Security Auditor. Find vulnerabilities, assess severity, and recommend fixes. Focus on OWASP Top 10, injection, XSS, auth issues.",
  capabilities: ["find-issues", "search-code", "open-file", "find-references", "get-diagram", "ai-insight"],
  triggerKeywords: ["security", "vulnerability", "injection", "xss", "sqli", "auth", "crypto", "secret", "password", "token", "cve", "owasp"],
  defaultPlanTemplate: {
    steps: [
      { capability: "find-issues", description: "Find security issues", parallelGroup: "discover" },
      { capability: "search-code", description: "Search for security patterns", parallelGroup: "discover" },
      { capability: "ai-insight", description: "Get AI security review", dependsOn: [0] },
    ],
  },
};

// ─── 3. Refactor Skill (from RefactoringAgent) ───
export const refactorSkill: Skill = {
  name: "refactor",
  description: "Refactor code for readability, maintainability, and design patterns",
  systemPrompt: "You are a Refactoring Expert. Improve code structure without changing behavior. Apply design patterns, reduce complexity, eliminate duplication.",
  capabilities: ["find-symbol", "find-references", "find-call-chain", "find-impact", "search-code", "open-file", "find-duplicates", "generate-patch", "apply-patch", "run-lint"],
  triggerKeywords: ["refactor", "clean", "restructure", "simplify", "extract", "inline", "rename", "pattern", "design", "maintainability"],
  defaultPlanTemplate: {
    steps: [
      { capability: "find-duplicates", description: "Find duplicate code", parallelGroup: "discover" },
      { capability: "find-impact", description: "Assess impact of changes", parallelGroup: "discover" },
      { capability: "generate-patch", description: "Generate refactor patch", dependsOn: [0, 1] },
      { capability: "apply-patch", description: "Apply refactor", dependsOn: [2] },
      { capability: "run-lint", description: "Verify", dependsOn: [3] },
    ],
  },
};

// ─── 4. Test Generation Skill (from TestAgent) ───
export const testGenSkill: Skill = {
  name: "test-gen",
  description: "Generate unit tests for functions and components",
  systemPrompt: "You are a Test Engineer. Generate comprehensive unit tests. Cover edge cases, happy paths, and error scenarios. Use the project's test framework.",
  capabilities: ["find-symbol", "open-file", "find-references", "search-code", "generate-patch", "apply-patch", "run-tests"],
  triggerKeywords: ["test", "unit test", "spec", "coverage", "mock", "jest", "vitest", "mocha", "jasmine"],
  defaultPlanTemplate: {
    steps: [
      { capability: "find-symbol", description: "Find the function to test" },
      { capability: "open-file", description: "Open the source file", dependsOn: [0] },
      { capability: "generate-patch", description: "Generate test file", dependsOn: [1] },
      { capability: "apply-patch", description: "Create test file", dependsOn: [2] },
      { capability: "run-tests", description: "Run tests", dependsOn: [3] },
    ],
  },
};

// ─── 5. Documentation Skill (from DocumentationAgent) ───
export const docsSkill: Skill = {
  name: "docs",
  description: "Generate documentation: README, API docs, architecture docs",
  systemPrompt: "You are a Technical Writer. Generate clear, concise documentation. Include examples, usage, and API references.",
  capabilities: ["find-architecture", "find-metrics", "open-file", "search-code", "get-diagram", "ai-insight"],
  triggerKeywords: ["document", "docs", "readme", "api doc", "comment", "javadoc", "jsdoc", "explain"],
  defaultPlanTemplate: {
    steps: [
      { capability: "find-architecture", description: "Get architecture overview", parallelGroup: "discover" },
      { capability: "find-metrics", description: "Get project metrics", parallelGroup: "discover" },
      { capability: "ai-insight", description: "Generate docs with AI", dependsOn: [0, 1] },
    ],
  },
};

// ─── 6. Code Review Skill (from CodeReviewerAgent) ───
export const codeReviewSkill: Skill = {
  name: "code-review",
  description: "Review code for quality, best practices, and improvements",
  systemPrompt: "You are a Senior Code Reviewer. Review code for quality, readability, performance, security, and best practices. Provide actionable feedback.",
  capabilities: ["find-issues", "find-symbol", "open-file", "search-code", "find-references", "find-architecture", "ai-insight"],
  triggerKeywords: ["review", "code review", "quality", "best practice", "clean code", "lint", "standard"],
  defaultPlanTemplate: {
    steps: [
      { capability: "find-issues", description: "Find all issues", parallelGroup: "discover" },
      { capability: "find-architecture", description: "Get architecture context", parallelGroup: "discover" },
      { capability: "ai-insight", description: "Generate review", dependsOn: [0, 1] },
    ],
  },
};

// ─── 7. Repository Analysis Skill (from RepositoryAnalystAgent) ───
export const repoAnalyzeSkill: Skill = {
  name: "repo-analyze",
  description: "Analyze repository: overview, health, tech stack, dependencies",
  systemPrompt: "You are a Repository Analyst. Provide a comprehensive overview of the repository. Analyze health, tech stack, dependencies, and architecture.",
  capabilities: ["find-architecture", "find-metrics", "find-issues", "find-circular-deps", "find-dead-code", "find-duplicates", "get-diagram", "ai-insight"],
  triggerKeywords: ["analyze", "overview", "health", "summary", "tech stack", "dependency", "structure", "report"],
  defaultPlanTemplate: {
    steps: [
      { capability: "find-architecture", description: "Get architecture", parallelGroup: "discover" },
      { capability: "find-metrics", description: "Get metrics", parallelGroup: "discover" },
      { capability: "find-issues", description: "Get all issues", parallelGroup: "discover" },
      { capability: "find-circular-deps", description: "Check for cycles", parallelGroup: "discover" },
      { capability: "ai-insight", description: "Generate overview", dependsOn: [0, 1, 2, 3] },
    ],
  },
};

// ─── 8. DevOps Skill (from DevOpsAgent) ───
export const devopsSkill: Skill = {
  name: "devops",
  description: "DevOps tasks: CI/CD, Docker, deployment, infrastructure",
  systemPrompt: "You are a DevOps Engineer. Help with CI/CD pipelines, Docker, deployment, and infrastructure. Analyze configs and suggest improvements.",
  capabilities: ["search-code", "open-file", "find-architecture", "generate-patch", "apply-patch", "run-script"],
  triggerKeywords: ["devops", "docker", "ci", "cd", "pipeline", "deploy", "kubernetes", "k8s", "terraform", "infrastructure", "container"],
  defaultPlanTemplate: {
    steps: [
      { capability: "search-code", description: "Find DevOps configs" },
      { capability: "open-file", description: "Open config files", dependsOn: [0] },
      { capability: "generate-patch", description: "Generate improvements", dependsOn: [1] },
    ],
  },
};

// ─── 9. Performance Skill (from PerformanceAgent) ───
export const performanceSkill: Skill = {
  name: "performance",
  description: "Analyze and optimize performance bottlenecks",
  systemPrompt: "You are a Performance Engineer. Find bottlenecks, analyze complexity, and suggest optimizations. Focus on N+1 queries, bundle size, render performance.",
  capabilities: ["find-issues", "find-symbol", "search-code", "open-file", "find-call-chain", "find-impact", "ai-insight", "generate-patch", "apply-patch"],
  triggerKeywords: ["performance", "slow", "optimize", "bottleneck", "latency", "speed", "fast", "efficient", "memory", "cpu", "query", "bundle"],
  defaultPlanTemplate: {
    steps: [
      { capability: "find-issues", description: "Find perf issues", parallelGroup: "discover" },
      { capability: "search-code", description: "Search for perf patterns", parallelGroup: "discover" },
      { capability: "find-call-chain", description: "Trace slow paths", dependsOn: [0] },
      { capability: "ai-insight", description: "Generate perf review", dependsOn: [2] },
    ],
  },
};

// ─── 10. PR Generation Skill (from PRGenerator) ───
export const prGenerateSkill: Skill = {
  name: "pr-generate",
  description: "Generate PR description from changes",
  systemPrompt: "You are a PR Generator. Analyze code changes and generate a clear PR description with summary, changes, and testing notes.",
  capabilities: ["git-diff", "search-code", "open-file", "find-issues", "ai-insight"],
  triggerKeywords: ["pr", "pull request", "commit", "merge", "description", "changelog"],
  defaultPlanTemplate: {
    steps: [
      { capability: "git-diff", description: "Get current changes" },
      { capability: "ai-insight", description: "Generate PR description", dependsOn: [0] },
    ],
  },
};

// ─── All Skills ───

export const allSkills: Skill[] = [
  bugFixSkill,
  securityAuditSkill,
  refactorSkill,
  testGenSkill,
  docsSkill,
  codeReviewSkill,
  repoAnalyzeSkill,
  devopsSkill,
  performanceSkill,
  prGenerateSkill,
];
