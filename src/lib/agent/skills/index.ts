// CodeInsight AI — Skills Public API (Layer 8)
// Barrel export for Skill Registry + definitions.

export type {
  Skill,
  PlanTemplate,
  PlanTemplateStep,
  SkillRegistry,
} from "../contracts";

export { SkillRegistryImpl } from "./skill-registry";
export type { Capability } from "../contracts";

// All 10 skill definitions
export {
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
} from "./definitions/all-skills";

import { SkillRegistryImpl } from "./skill-registry";
import { allSkills } from "./definitions/all-skills";

/**
 * Create a SkillRegistry with all 10 skills registered.
 */
export function createSkillRegistry(): SkillRegistryImpl {
  const registry = new SkillRegistryImpl();
  for (const skill of allSkills) {
    registry.register(skill);
  }
  return registry;
}
