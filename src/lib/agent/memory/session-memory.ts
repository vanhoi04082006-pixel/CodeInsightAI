// CodeInsight AI — Session Memory (Layer 7, Memory Layer 3)
// Per-session: chat history + user preferences.
// Stored in sessionStorage.

import type {
  SessionMemory as ISessionMemory,
  ConversationMessage,
  UserPreferences,
} from "../contracts";

const DEFAULT_PREFERENCES: UserPreferences = {
  autoApproveReadTools: true,
  autoApproveWriteTools: false,
  maxParallel: 3,
  defaultTimeout: 30000,
};

export class SessionMemoryImpl implements ISessionMemory {
  messages: ConversationMessage[] = [];
  locale: "en" | "vi" = "en";
  preferences: UserPreferences = { ...DEFAULT_PREFERENCES };

  constructor() {
    this.load();
  }

  addMessage(msg: ConversationMessage): void {
    this.messages.push(msg);
    this.persist();
  }

  clear(): void {
    this.messages = [];
    this.persist();
  }

  /** Update preferences */
  updatePreferences(patch: Partial<UserPreferences>): void {
    this.preferences = { ...this.preferences, ...patch };
    this.persist();
  }

  /** Get recent messages (last N) */
  getRecentMessages(count: number = 20): ConversationMessage[] {
    return this.messages.slice(-count);
  }

  /** Get messages by role */
  getMessagesByRole(role: ConversationMessage["role"]): ConversationMessage[] {
    return this.messages.filter((m) => m.role === role);
  }

  /** Set locale */
  setLocale(locale: "en" | "vi"): void {
    this.locale = locale;
    this.persist();
  }

  /** Persist to sessionStorage */
  private persist(): void {
    if (typeof window === "undefined") return;
    try {
      const data = {
        messages: this.messages.slice(-100), // keep last 100
        locale: this.locale,
        preferences: this.preferences,
      };
      sessionStorage.setItem("agent-session", JSON.stringify(data));
    } catch {
      // quota exceeded — silent
    }
  }

  /** Load from sessionStorage */
  private load(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("agent-session");
      if (!raw) return;
      const data = JSON.parse(raw);
      this.messages = data.messages || [];
      this.locale = data.locale || "en";
      this.preferences = { ...DEFAULT_PREFERENCES, ...data.preferences };
    } catch {
      // corrupt data — use defaults
    }
  }

  /** Clear session storage */
  static clearStorage(): void {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("agent-session");
    }
  }
}
