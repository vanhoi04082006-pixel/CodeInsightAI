/**
 * Auth helper tests — verify requireUserId/requireAdmin logic.
 * These are unit tests for the auth module's exported functions.
 * Since they depend on getServerSession (which needs Next.js context),
 * we test the logic that can be extracted.
 */

describe("Auth Configuration", () => {
  it("should have GitHub as the only provider", async () => {
    // Read auth.ts source to verify no GoogleProvider
    const fs = await import("fs");
    const path = await import("path");
    const authSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/auth.ts"),
      "utf-8"
    );
    expect(authSource).toContain("GithubProvider");
    expect(authSource).not.toContain("GoogleProvider");
  });

  it("should use JWT session strategy", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const authSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/auth.ts"),
      "utf-8"
    );
    expect(authSource).toContain('strategy: "jwt"');
  });

  it("should have allowDangerousEmailAccountLinking enabled", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const authSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/auth.ts"),
      "utf-8"
    );
    expect(authSource).toContain("allowDangerousEmailAccountLinking: true");
  });
});

describe("Platform AI Config Resolution", () => {
  it("should fall back to env vars when DB has no config", async () => {
    // getPlatformAIConfigFromEnv is a sync function — safe to test
    const { getPlatformAIConfigFromEnv } = await import("@/lib/platform-ai");

    // Save original env
    const origKey = process.env.PLATFORM_AI_API_KEY;
    const origProvider = process.env.PLATFORM_AI_PROVIDER;
    const origModel = process.env.PLATFORM_AI_MODEL;

    // Set test env
    process.env.PLATFORM_AI_API_KEY = "test-key-123";
    process.env.PLATFORM_AI_PROVIDER = "openai";
    process.env.PLATFORM_AI_MODEL = "gpt-4o-mini";

    const config = getPlatformAIConfigFromEnv();
    expect(config).not.toBeNull();
    expect(config!.providerId).toBe("openai");
    expect(config!.apiKey).toBe("test-key-123");
    expect(config!.model).toBe("gpt-4o-mini");

    // Restore env
    if (origKey) process.env.PLATFORM_AI_API_KEY = origKey;
    else delete process.env.PLATFORM_AI_API_KEY;
    if (origProvider) process.env.PLATFORM_AI_PROVIDER = origProvider;
    else delete process.env.PLATFORM_AI_PROVIDER;
    if (origModel) process.env.PLATFORM_AI_MODEL = origModel;
    else delete process.env.PLATFORM_AI_MODEL;
  });

  it("should return null when no env vars set", async () => {
    const { getPlatformAIConfigFromEnv } = await import("@/lib/platform-ai");

    const origKey = process.env.PLATFORM_AI_API_KEY;
    delete process.env.PLATFORM_AI_API_KEY;

    const config = getPlatformAIConfigFromEnv();
    expect(config).toBeNull();

    if (origKey) process.env.PLATFORM_AI_API_KEY = origKey;
  });

  it("should default to openrouter when provider not specified", async () => {
    const { getPlatformAIConfigFromEnv } = await import("@/lib/platform-ai");

    const origKey = process.env.PLATFORM_AI_API_KEY;
    const origProvider = process.env.PLATFORM_AI_PROVIDER;

    process.env.PLATFORM_AI_API_KEY = "test-key";
    delete process.env.PLATFORM_AI_PROVIDER;

    const config = getPlatformAIConfigFromEnv();
    expect(config).not.toBeNull();
    expect(config!.providerId).toBe("openrouter");

    if (origKey) process.env.PLATFORM_AI_API_KEY = origKey;
    else delete process.env.PLATFORM_AI_API_KEY;
    if (origProvider) process.env.PLATFORM_AI_PROVIDER = origProvider;
    else delete process.env.PLATFORM_AI_PROVIDER;
  });
});

describe("AI Client Types", () => {
  it("should export callAI function", async () => {
    const mod = await import("@/lib/ai-client");
    expect(typeof mod.callAI).toBe("function");
  });

  it("should export streamAI function", async () => {
    const mod = await import("@/lib/ai-client");
    expect(typeof mod.streamAI).toBe("function");
  });
});

describe("Provider Presets", () => {
  it("should have 14 provider presets", async () => {
    const { PROVIDER_PRESETS } = await import("@/lib/providers");
    expect(PROVIDER_PRESETS.length).toBe(14);
  });

  it("should include OpenRouter, OpenAI, Anthropic, Gemini", async () => {
    const { PROVIDER_PRESETS } = await import("@/lib/providers");
    const ids = PROVIDER_PRESETS.map((p) => p.providerId);
    expect(ids).toContain("openrouter");
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("gemini");
  });

  it("should mark Ollama and LM Studio as local", async () => {
    const { PRESET_BY_ID } = await import("@/lib/providers");
    expect(PRESET_BY_ID.ollama.local).toBe(true);
    expect(PRESET_BY_ID.lmstudio.local).toBe(true);
    expect(PRESET_BY_ID.openai.local).toBe(false);
  });

  it("should have feature defaults mapping", async () => {
    const { FEATURE_DEFAULTS } = await import("@/lib/providers");
    expect(FEATURE_DEFAULTS.chat).toBe("openai");
    expect(FEATURE_DEFAULTS.bugs).toBe("anthropic");
    expect(FEATURE_DEFAULTS.security).toBe("anthropic");
    expect(FEATURE_DEFAULTS.vision).toBe("gemini");
  });
});

describe("Environment Detection", () => {
  it("should detect non-production environment", async () => {
    const { isProduction } = await import("@/lib/env");
    // In test environment, NODE_ENV is 'test' → isProduction should be false
    expect(isProduction).toBe(false);
  });
});
