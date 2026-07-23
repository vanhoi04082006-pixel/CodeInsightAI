// CodeInsight AI — Knowledge Base: Semantic Memory (Prompt 13)
// A higher-level wrapper around `MemoryStore` that provides semantic operations
// tailored to the CodeInsight AI use case: remembering conversations, fixes,
// architecture decisions, and coding-style observations for a repository.

import {
  memoryStore,
  type MemoryEntry,
  type MemoryCategory,
} from "./memory-store";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

export interface FixRecord {
  repoUrl: string;
  bug: string;
  fix: string;
  filesChanged: string[];
  commitHash?: string;
  timestamp: number;
}

export interface DecisionRecord {
  repoUrl: string;
  decision: string;
  rationale: string;
  context: string;
  timestamp: number;
}

export interface CodingStyleRecord {
  repoUrl: string;
  rules: string[];
  timestamp: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function repoTag(repoUrl: string): string {
  return `repo:${repoUrl}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

/** Generate a short summary of a conversation (very lightweight for now). */
function summarizeConversation(messages: ConversationMessage[]): string {
  const userTurns = messages.filter((m) => m.role === "user").length;
  const assistantTurns = messages.filter((m) => m.role === "assistant").length;
  const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.content;
  const parts: string[] = [];
  parts.push(`Conversation with ${userTurns} user turn(s) and ${assistantTurns} assistant turn(s).`);
  parts.push(`First user message: ${truncate(firstUser, 200)}`);
  if (lastAssistant) {
    parts.push(`Final assistant message: ${truncate(lastAssistant, 200)}`);
  }
  return parts.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// SemanticMemory
// ────────────────────────────────────────────────────────────────────────────

export class SemanticMemory {
  constructor(private store = memoryStore) {}

  // ── Remember operations ────────────────────────────────────────────────

  /** Store a summary of a conversation about a repository. */
  async rememberConversation(
    repoUrl: string,
    messages: ConversationMessage[],
  ): Promise<MemoryEntry> {
    const summary = summarizeConversation(messages);
    const fullText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")
      .slice(0, 8000);
    return this.store.store({
      category: "conversation" as MemoryCategory,
      key: `conversation:${repoUrl}:${Date.now()}`,
      value: { summary, fullText, messageCount: messages.length },
      tags: [repoTag(repoUrl), "conversation"],
    });
  }

  /** Store a bug fix for future reference. */
  async rememberFix(
    repoUrl: string,
    bug: string,
    fix: string,
    filesChanged: string[],
    commitHash?: string,
  ): Promise<MemoryEntry> {
    return this.store.store({
      category: "previous-fix" as MemoryCategory,
      key: `fix:${repoUrl}:${commitHash ?? Date.now()}`,
      value: {
        repoUrl,
        bug,
        fix,
        filesChanged,
        commitHash,
        timestamp: Date.now(),
      } satisfies FixRecord,
      tags: [repoTag(repoUrl), "fix", ...this.tagsFromText(`${bug} ${fix}`)],
    });
  }

  /** Store an architecture decision record. */
  async rememberDecision(
    repoUrl: string,
    decision: string,
    rationale: string,
    context: string,
  ): Promise<MemoryEntry> {
    return this.store.store({
      category: "architecture-decision" as MemoryCategory,
      key: `decision:${repoUrl}:${Date.now()}`,
      value: {
        repoUrl,
        decision,
        rationale,
        context,
        timestamp: Date.now(),
      } satisfies DecisionRecord,
      tags: [repoTag(repoUrl), "adr", ...this.tagsFromText(decision)],
    });
  }

  /** Store coding style observations for a repository. */
  async rememberCodingStyle(
    repoUrl: string,
    rules: string[],
  ): Promise<MemoryEntry> {
    return this.store.store({
      category: "coding-style" as MemoryCategory,
      key: `coding-style:${repoUrl}`,
      value: {
        repoUrl,
        rules,
        timestamp: Date.now(),
      } satisfies CodingStyleRecord,
      tags: [repoTag(repoUrl), "style"],
    });
  }

  /** Generic remember — passthrough to the underlying store. */
  async remember(
    category: MemoryCategory,
    key: string,
    value: unknown,
    tags: string[] = [],
  ): Promise<MemoryEntry> {
    return this.store.store({ category, key, value, tags });
  }

  // ── Recall operations ──────────────────────────────────────────────────

  /** Find past fixes similar to the given bug description. */
  async recallSimilarFixes(
    repoUrl: string,
    bugDescription: string,
    limit: number = 5,
  ): Promise<FixRecord[]> {
    const entries = await this.store.search(bugDescription, {
      category: "previous-fix",
      tags: [repoTag(repoUrl)],
      limit,
      minScore: 0.1,
    });
    return entries.map((e) => e.value as FixRecord);
  }

  /** Recall all architecture decisions for a repo (most-recent first). */
  async recallDecisions(
    repoUrl: string,
    limit: number = 50,
  ): Promise<DecisionRecord[]> {
    const entries = await this.store.searchByTag(repoTag(repoUrl), limit * 4);
    return entries
      .filter((e) => e.category === "architecture-decision")
      .slice(0, limit)
      .map((e) => e.value as DecisionRecord)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Recall coding-style rules for a repo. */
  async recallCodingStyle(repoUrl: string): Promise<CodingStyleRecord | null> {
    const entries = await this.store.searchByTag(repoTag(repoUrl), 200);
    const styleEntry = entries.find(
      (e) => e.category === "coding-style" && e.key === `coding-style:${repoUrl}`,
    );
    return styleEntry ? (styleEntry.value as CodingStyleRecord) : null;
  }

  /** Recall recent conversations about a repo. */
  async recallConversations(
    repoUrl: string,
    limit: number = 10,
  ): Promise<MemoryEntry[]> {
    const entries = await this.store.searchByTag(repoTag(repoUrl), limit * 4);
    return entries
      .filter((e) => e.category === "conversation")
      .slice(0, limit)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ── Context building ───────────────────────────────────────────────────

  /**
   * Build a context string suitable for inclusion in an AI prompt.
   * Pulls the most relevant memories for the query and formats them concisely.
   */
  async buildContext(repoUrl: string, query: string): Promise<string> {
    const sections: string[] = [];

    // 1. Coding style rules (always included if present — small and high-signal)
    const style = await this.recallCodingStyle(repoUrl);
    if (style && style.rules.length > 0) {
      sections.push(
        "Coding style for this repository:\n" +
          style.rules.map((r) => `- ${r}`).join("\n"),
      );
    }

    // 2. Architecture decisions (most recent N)
    const decisions = await this.recallDecisions(repoUrl, 5);
    if (decisions.length > 0) {
      sections.push(
        "Recent architecture decisions:\n" +
          decisions
            .map(
              (d) =>
                `- ${d.decision}\n  Rationale: ${truncate(d.rationale, 120)}`,
            )
            .join("\n"),
      );
    }

    // 3. Similar past fixes (semantic search)
    if (query && query.trim().length > 3) {
      const similarFixes = await this.recallSimilarFixes(repoUrl, query, 3);
      if (similarFixes.length > 0) {
        sections.push(
          "Similar past fixes (for reference):\n" +
            similarFixes
              .map(
                (f) =>
                  `- Bug: ${truncate(f.bug, 100)}\n  Fix: ${truncate(f.fix, 100)}\n  Files: ${f.filesChanged.join(", ")}`,
              )
              .join("\n"),
        );
      }
    }

    // 4. Relevant conversations (top 2)
    const conversations = await this.recallConversations(repoUrl, 2);
    if (conversations.length > 0) {
      sections.push(
        "Recent conversations:\n" +
          conversations
            .map((c) => {
              const v = c.value as { summary?: string };
              return `- ${truncate(v.summary ?? c.key, 200)}`;
            })
            .join("\n"),
      );
    }

    if (sections.length === 0) {
      return "";
    }
    return sections.join("\n\n---\n\n");
  }

  // ── Forget operations ──────────────────────────────────────────────────

  /** Forget a single memory entry. */
  async forget(id: string): Promise<void> {
    await this.store.forget(id);
  }

  /** Clear all memory for a repo (across all categories). */
  async forgetRepo(repoUrl: string): Promise<number> {
    const tag = repoTag(repoUrl);
    const all = await this.store.getAll();
    let count = 0;
    for (const e of all) {
      if (e.tags.includes(tag)) {
        await this.store.forget(e.id);
        count += 1;
      }
    }
    return count;
  }

  // ── Export / import ────────────────────────────────────────────────────

  async exportJSON(): Promise<string> {
    return this.store.exportJSON();
  }

  async importJSON(json: string): Promise<void> {
    return this.store.importJSON(json);
  }

  // ── Internals ──────────────────────────────────────────────────────────

  /** Extract a few simple tags (lowercased keywords) from a text blob. */
  private tagsFromText(text: string): string[] {
    const words = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && w.length <= 16)
      // Filter out common stop-words
      .filter(
        (w) =>
          ![
            "that", "this", "with", "from", "have", "will", "your", "their",
            "what", "when", "where", "which", "there", "about", "into",
            "should", "would", "could", "after", "before", "because",
          ].includes(w),
      )
      .slice(0, 5);
    return Array.from(new Set(words));
  }
}

// Singleton
export const semanticMemory = new SemanticMemory();
