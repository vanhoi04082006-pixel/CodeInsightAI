// CodeInsight AI — P3.5 Policy Engine: type definitions + fixed catalog.
//
// FIXED CATALOG of 8 policy types — NO arbitrary eval (security: prevents
// code injection from admin-configured strings). Each policy type has a
// typed `config` shape that is enforced by the evaluator's switch-case.
//
// A `Policy` row is the persisted admin configuration. `PolicyEvaluationContext`
// is the per-request snapshot of facts (file count, provider id, user id, …)
// that the pure `evaluatePolicies()` function compares each policy against.
// `PolicyViolation` is the output — `severity: "block"` → 403; `severity: "warn"`
// → log + continue (e.g. cap maxTokens).

export type PolicyType =
  | "max-files" // block analysis if repo has > N files
  | "max-file-size" // block if any file > N MB
  | "block-provider" // disable specific AI provider
  | "block-language" // block analysis of specific languages
  | "require-auth" // require login (always true in our system, but policy can enforce 2FA in future)
  | "block-private-repos" // don't allow private repo analysis
  | "max-tokens-per-call" // cap maxTokens per AI call
  | "allowed-models-only"; // whitelist of allowed models

/** A configured policy instance (one row in the `Policy` table). */
export interface Policy {
  id: string;
  type: PolicyType;
  enabled: boolean;
  /** Type-specific config — schema depends on `type` (see POLICY_CATALOG). */
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-request snapshot of facts that policies evaluate against.
 * All fields optional — the evaluator skips a policy if the relevant
 * context field is missing (e.g. `max-files` is skipped when `fileCount`
 * is undefined, so a pre-analyze check can run before file count is known).
 */
export interface PolicyEvaluationContext {
  // ── Repo context ──
  fileCount?: number;
  fileSizeBytes?: number;
  languages?: string[];
  isPrivateRepo?: boolean;
  // ── AI context ──
  providerId?: string;
  model?: string;
  maxTokens?: number;
  // ── User context ──
  userId?: string;
  plan?: string;
}

/**
 * A single policy violation. `severity` determines whether the request
 * is blocked (403) or only warned (logged + the call continues, possibly
 * with a modified parameter such as a capped `maxTokens`).
 */
export interface PolicyViolation {
  policyId: string;
  policyType: PolicyType;
  reason: string;
  severity: "block" | "warn";
}

/**
 * Metadata for each policy type — used by the admin UI to render the
 * configuration form for an unconfigured policy and to label the toggle
 * in the catalog list. The `configSchema` defines the typed fields the
 * admin edits; the evaluator reads the same keys at runtime.
 *
 * NOTE: this catalog is FIXED at compile time — adding a new policy type
 * requires a code change (types.ts + evaluator.ts + admin UI). This is a
 * deliberate security trade-off: admins cannot inject arbitrary eval logic.
 */
export interface PolicyCatalogEntry {
  type: PolicyType;
  label: string;
  description: string;
  configSchema: Record<
    string,
    {
      type: "number" | "string" | "boolean";
      label: string;
      default: any;
    }
  >;
}

export const POLICY_CATALOG: PolicyCatalogEntry[] = [
  {
    type: "max-files",
    label: "Max Files",
    description: "Block analysis if repository has more than N files",
    configSchema: {
      maxFiles: { type: "number", label: "Max files", default: 1000 },
    },
  },
  {
    type: "max-file-size",
    label: "Max File Size",
    description: "Block if any single file exceeds N MB",
    configSchema: {
      maxMb: { type: "number", label: "Max size (MB)", default: 5 },
    },
  },
  {
    type: "block-provider",
    label: "Block Provider",
    description: "Disable a specific AI provider",
    configSchema: {
      providerId: {
        type: "string",
        label: "Provider ID",
        default: "openai",
      },
    },
  },
  {
    type: "block-language",
    label: "Block Language",
    description: "Block analysis of specific programming languages",
    configSchema: {
      languages: {
        type: "string",
        label: "Languages (comma-separated)",
        default: "PHP,Perl",
      },
    },
  },
  {
    type: "block-private-repos",
    label: "Block Private Repos",
    description: "Don't allow analysis of private repositories",
    configSchema: {},
  },
  {
    type: "max-tokens-per-call",
    label: "Max Tokens Per Call",
    description: "Cap the maxTokens parameter on AI calls (warn + cap)",
    configSchema: {
      maxTokens: { type: "number", label: "Max tokens", default: 4000 },
    },
  },
  {
    type: "allowed-models-only",
    label: "Allowed Models Only",
    description: "Whitelist of allowed AI models",
    configSchema: {
      models: {
        type: "string",
        label: "Models (comma-separated)",
        default: "gpt-4o-mini,claude-3-haiku",
      },
    },
  },
  {
    type: "require-auth",
    label: "Require Authentication",
    description:
      "Require user login (always enforced, but policy makes it explicit)",
    configSchema: {},
  },
];

/** Lookup map: PolicyType → catalog entry (for the admin UI). */
export const POLICY_CATALOG_BY_TYPE: Record<PolicyType, PolicyCatalogEntry> =
  POLICY_CATALOG.reduce(
    (acc, entry) => {
      acc[entry.type] = entry;
      return acc;
    },
    {} as Record<PolicyType, PolicyCatalogEntry>,
  );

/**
 * Build a default `config` object for a policy type by reading the
 * `default` value of each field in the catalog entry's `configSchema`.
 * Used by the admin API when a new policy is created without explicit
 * config (the UI also pre-fills the form with these defaults).
 */
export function defaultConfigForType(type: PolicyType): Record<string, any> {
  const entry = POLICY_CATALOG_BY_TYPE[type];
  if (!entry) return {};
  const config: Record<string, any> = {};
  for (const [key, field] of Object.entries(entry.configSchema)) {
    config[key] = field.default;
  }
  return config;
}

/** Type-narrowing guard — accepts any string, returns true if it's a known PolicyType. */
export function isPolicyType(value: string): value is PolicyType {
  return POLICY_CATALOG.some((entry) => entry.type === value);
}
