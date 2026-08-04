// CodeInsight AI — Skill Registry (Layer 8)
// Registers skills, auto-routes by keywords, provides lookup.

import type { Skill, SkillRegistry as ISkillRegistry } from "../contracts";

export class SkillRegistryImpl implements ISkillRegistry {
  private readonly skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill | null {
    return this.skills.get(name) ?? null;
  }

  /**
   * Auto-route a user query to the best matching skill.
   * Matching strategy: score each skill by how many trigger keywords appear
   * in the query (case-insensitive). Return the highest-scoring skill, or null.
   */
  match(query: string): Skill | null {
    const lowerQuery = query.toLowerCase();

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
  }
}
