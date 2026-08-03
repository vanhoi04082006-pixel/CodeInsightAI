// CodeInsight AI — Skill Registry (Layer 8)
// Registers skills, auto-routes by keywords, provides lookup.

import type { Skill, SkillRegistry as ISkillRegistry } from "../contracts";

export class SkillRegistryImpl implements ISkillRegistry {
  private readonly skills = new Map<string, Skill>();
  private readonly keywordIndex = new Map<string, string>(); // keyword → skill name

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);

    // Index trigger keywords (lowercase for case-insensitive matching)
    for (const keyword of skill.triggerKeywords) {
      this.keywordIndex.set(keyword.toLowerCase(), skill.name);
    }
  }

  get(name: string): Skill | null {
    return this.skills.get(name) ?? null;
  }

  /**
   * Auto-route a user query to the best matching skill.
   * Matching strategy:
   * 1. Check if any trigger keyword appears in the query (case-insensitive)
   * 2. Return the first match (skills registered first have priority)
   * 3. If no match, return null (Planner will use default)
   */
  match(query: string): Skill | null {
    const lowerQuery = query.toLowerCase();

    // Score each skill by how many keywords match
    let bestSkill: Skill | null = null;
    let bestScore = 0;

    for (const skill of this.skills.values()) {
      let score = 0;
      for (const keyword of skill.triggerKeywords) {
        if (lowerQuery.includes(keyword.toLowerCase())) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestSkill = skill;
      }
    }

    return bestSkill;
  }

  list(): Skill[] {
    return [...this.skills.values()];
  }

  /** List all skill names */
  listNames(): string[] {
    return [...this.skills.keys()];
  }

  /** Count registered skills */
  count(): number {
    return this.skills.size;
  }

  /** Clear all skills (for testing) */
  clear(): void {
    this.skills.clear();
    this.keywordIndex.clear();
  }
}
