// CodeInsight AI — Static Analysis Stats
//
// Centralized constants for static analysis rule counts.
// Used by landing-view, onboarding-overlay, layout metadata, etc.
//
// Counts are derived from the actual analyzer source files so the numbers
// can never drift from the implemented rules:
//   src/lib/analyzers/security.ts     — 13 core + 77 extra = 90 rule checks
//   src/lib/analyzers/bugs.ts         — 11 core + 69 extra = 80 rule checks
//   src/lib/analyzers/performance.ts  — 42 core + 38 extra = 80 rule checks
//   Total: 250 static analysis rules
//
// When adding/removing a rule in any analyzer, update the locale files
// (landing.json: principleFastDesc, pricing.f1, etc.).

import { SECURITY_EXTRA_RULES } from "./analyzers/security";
import { BUGS_EXTRA_RULES } from "./analyzers/bugs";
import { PERFORMANCE_EXTRA_RULES } from "./analyzers/performance";

export const STATIC_RULES_SECURITY = 13 + SECURITY_EXTRA_RULES.length;
export const STATIC_RULES_BUGS = 11 + BUGS_EXTRA_RULES.length;
export const STATIC_RULES_PERFORMANCE = 42 + PERFORMANCE_EXTRA_RULES.length;
export const STATIC_RULES_TOTAL =
  STATIC_RULES_SECURITY + STATIC_RULES_BUGS + STATIC_RULES_PERFORMANCE; // 250

// Supported programming languages (approximate — analyzers work on any text-based code)
export const SUPPORTED_LANGUAGES = 40;

// Average analysis time (static pass, seconds)
export const AVG_ANALYSIS_SECONDS = 60;
