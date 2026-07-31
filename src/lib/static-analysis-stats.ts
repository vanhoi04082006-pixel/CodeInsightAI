// CodeInsight AI — Static Analysis Stats
//
// Centralized constants for static analysis rule counts.
// Used by landing-view, onboarding-overlay, layout metadata, etc.
//
// These counts are verified against the actual analyzer source files:
//   src/lib/analyzers/security.ts     — 13 rule checks
//   src/lib/analyzers/bugs.ts         — 11 rule checks
//   src/lib/analyzers/performance.ts  — 42 rule checks (40 core + 2 framework-specific)
//   Total: 66 static analysis rules
//
// When adding/removing a rule in any analyzer, update the count here AND
// in the locale files (landing.json: principleFastDesc, pricing.f1).

export const STATIC_RULES_SECURITY = 13;
export const STATIC_RULES_BUGS = 11;
export const STATIC_RULES_PERFORMANCE = 42;
export const STATIC_RULES_TOTAL =
  STATIC_RULES_SECURITY + STATIC_RULES_BUGS + STATIC_RULES_PERFORMANCE; // 66

// Supported programming languages (approximate — analyzers work on any text-based code)
export const SUPPORTED_LANGUAGES = 40;

// Average analysis time (static pass, seconds)
export const AVG_ANALYSIS_SECONDS = 60;
