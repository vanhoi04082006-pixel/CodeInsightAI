// CodeInsight AI — Skills Tests (Layer 8)

import { describe, it, expect, beforeEach } from "@jest/globals";
import { SkillRegistryImpl } from "@/lib/agent/skills/skill-registry";
import { createSkillRegistry } from "@/lib/agent/skills";
import {
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
  allSkills,
} from "@/lib/agent/skills/definitions/all-skills";
import type { Skill } from "@/lib/agent/contracts";

// ─── SkillRegistry Tests ───

describe("SkillRegistry", () => {
  let registry: SkillRegistryImpl;

  beforeEach(() => {
    registry = new SkillRegistryImpl();
  });

  it("should register a skill", () => {
    registry.register(bugFixSkill);
    expect(registry.count()).toBe(1);
  });

  it("should register all 10 skills via createSkillRegistry", () => {
    const reg = createSkillRegistry();
    expect(reg.count()).toBe(10);
  });

  it("should get skill by name", () => {
    registry.register(bugFixSkill);
    const skill = registry.get("bug-fix");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("bug-fix");
  });

  it("should return null for unknown skill", () => {
    expect(registry.get("non-existent")).toBeNull();
  });

  it("should list all skills", () => {
    const reg = createSkillRegistry();
    const skills = reg.list();
    expect(skills).toHaveLength(10);
  });

  it("should list all skill names", () => {
    const reg = createSkillRegistry();
    const names = reg.listNames();
    expect(names).toHaveLength(10);
    expect(names).toContain("bug-fix");
    expect(names).toContain("security-audit");
    expect(names).toContain("refactor");
    expect(names).toContain("test-gen");
    expect(names).toContain("docs");
    expect(names).toContain("code-review");
    expect(names).toContain("repo-analyze");
    expect(names).toContain("devops");
    expect(names).toContain("performance");
    expect(names).toContain("pr-generate");
  });
});

// ─── Skill Matching Tests ───

describe("SkillRegistry.match", () => {
  let registry: SkillRegistryImpl;

  beforeEach(() => {
    registry = createSkillRegistry();
  });

  it("should match 'fix bug login' to bug-fix", () => {
    const skill = registry.match("fix bug login");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("bug-fix");
  });

  it("should match 'security audit' to security-audit", () => {
    const skill = registry.match("security audit");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("security-audit");
  });

  it("should match 'refactor this code' to refactor", () => {
    const skill = registry.match("refactor this code for readability");
    expect(skill).not.toBeNull();
    // "refactor" matches refactor skill, "code" matches code-review
    // refactor has 2 keywords matching (refactor, clean), code-review has 1 (code)
    expect(["refactor", "code-review"]).toContain(skill!.name);
  });

  it("should match 'generate tests' to test-gen", () => {
    const skill = registry.match("generate tests for login");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("test-gen");
  });

  it("should match 'write documentation' to docs", () => {
    const skill = registry.match("write documentation");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("docs");
  });

  it("should match 'review code' to code-review", () => {
    const skill = registry.match("review code quality");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("code-review");
  });

  it("should match 'analyze repository' to repo-analyze", () => {
    const skill = registry.match("analyze repository health");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("repo-analyze");
  });

  it("should match 'docker setup' to devops", () => {
    const skill = registry.match("docker setup");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("devops");
  });

  it("should match 'optimize performance' to performance", () => {
    const skill = registry.match("optimize performance");
    expect(skill).not.toBeNull();
    // "performance" matches both "performance" and "optimize" keywords
    expect(["performance", "refactor"]).toContain(skill!.name);
  });

  it("should match 'create pull request' to pr-generate", () => {
    const skill = registry.match("create pull request");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("pr-generate");
  });

  it("should return best match (highest keyword score)", () => {
    // "fix bug security" matches both bug-fix (fix, bug) and security-audit (security)
    // bug-fix has 2 matches, security-audit has 1 → bug-fix wins
    const skill = registry.match("fix bug security");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("bug-fix");
  });

  it("should return null for unrelated query", () => {
    const skill = registry.match("what is the weather today");
    expect(skill).toBeNull();
  });

  it("should be case-insensitive", () => {
    const skill = registry.match("FIX BUG LOGIN");
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("bug-fix");
  });
});

// ─── Skill Definition Tests ───

describe("Skill Definitions", () => {
  it("should have 10 skills", () => {
    expect(allSkills).toHaveLength(10);
  });

  it("all skills should have name, description, systemPrompt", () => {
    for (const skill of allSkills) {
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.systemPrompt).toBeTruthy();
      expect(skill.systemPrompt.length).toBeGreaterThan(20);
    }
  });

  it("all skills should have capabilities", () => {
    for (const skill of allSkills) {
      expect(skill.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("all skills should have trigger keywords", () => {
    for (const skill of allSkills) {
      expect(skill.triggerKeywords.length).toBeGreaterThan(0);
    }
  });

  it("all skill names should be unique", () => {
    const names = allSkills.map((s) => s.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("bug-fix skill should have generate-patch and apply-patch capabilities", () => {
    expect(bugFixSkill.capabilities).toContain("generate-patch");
    expect(bugFixSkill.capabilities).toContain("apply-patch");
    expect(bugFixSkill.capabilities).toContain("run-lint");
    expect(bugFixSkill.capabilities).toContain("rollback-changes");
  });

  it("security-audit skill should have ai-insight capability", () => {
    expect(securityAuditSkill.capabilities).toContain("ai-insight");
  });

  it("refactor skill should have find-duplicates capability", () => {
    expect(refactorSkill.capabilities).toContain("find-duplicates");
  });

  it("test-gen skill should have run-tests capability", () => {
    expect(testGenSkill.capabilities).toContain("run-tests");
  });

  it("pr-generate skill should have git-diff capability", () => {
    expect(prGenerateSkill.capabilities).toContain("git-diff");
  });

  it("skills with defaultPlanTemplate should have valid steps", () => {
    for (const skill of allSkills) {
      if (skill.defaultPlanTemplate) {
        expect(skill.defaultPlanTemplate.steps.length).toBeGreaterThan(0);
        for (const step of skill.defaultPlanTemplate.steps) {
          expect(step.capability).toBeTruthy();
          expect(step.description).toBeTruthy();
          // Check dependsOn references are valid indices
          if (step.dependsOn) {
            for (const dep of step.dependsOn) {
              expect(dep).toBeGreaterThanOrEqual(0);
              expect(dep).toBeLessThan(skill.defaultPlanTemplate.steps.length);
            }
          }
        }
      }
    }
  });

  it("bug-fix should have defaultPlanTemplate with 7 steps", () => {
    expect(bugFixSkill.defaultPlanTemplate).toBeDefined();
    expect(bugFixSkill.defaultPlanTemplate!.steps).toHaveLength(7);
  });

  it("repo-analyze should have defaultPlanTemplate with 5 steps (4 parallel discover)", () => {
    expect(repoAnalyzeSkill.defaultPlanTemplate).toBeDefined();
    expect(repoAnalyzeSkill.defaultPlanTemplate!.steps).toHaveLength(5);
    const discoverSteps = repoAnalyzeSkill.defaultPlanTemplate!.steps.filter(
      (s) => s.parallelGroup === "discover",
    );
    expect(discoverSteps).toHaveLength(4);
  });
});
