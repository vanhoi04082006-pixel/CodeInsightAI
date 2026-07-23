/**
 * CodeInsight AI — Environment detection (local vs production)
 *
 * Reads:
 *   - process.env.APP_ENV             (server-side, authoritative)
 *   - process.env.NEXT_PUBLIC_APP_ENV (client-side, mirrored)
 *
 * Falls back to NODE_ENV if APP_ENV is not set explicitly.
 *
 * Usage:
 *   import { isProduction, isLocal, APP_ENV } from "@/lib/env";
 *   if (isProduction) { ... use server-side encrypted credentials ... }
 *
 * Production is set on Vercel via Environment Variables:
 *   APP_ENV=production
 *   NEXT_PUBLIC_APP_ENV=production
 *
 * Local .env sets:
 *   APP_ENV=development
 *   NEXT_PUBLIC_APP_ENV=development
 */

export type AppEnv = "development" | "production" | "test";

function readEnv(): AppEnv {
  const raw =
    (typeof process !== "undefined" && process.env?.APP_ENV) ||
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_APP_ENV) ||
    process?.env?.NODE_ENV ||
    "development";
  if (raw === "production") return "production";
  if (raw === "test") return "test";
  return "development";
}

export const APP_ENV: AppEnv = readEnv();
export const isProduction: boolean = APP_ENV === "production";
export const isLocal: boolean = APP_ENV === "development";
export const isTest: boolean = APP_ENV === "test";

/**
 * The public app origin (used for OAuth callbacks, Stripe redirects, etc.).
 * On Vercel, this is the deployment URL. Locally, http://localhost:3000.
 */
export const APP_ORIGIN: string =
  (typeof process !== "undefined" && process.env?.NEXTAUTH_URL) ||
  (typeof process !== "undefined" && process.env?.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

/**
 * Whether Platform AI is configured (i.e. the server has a platform key).
 * Used by the frontend to decide whether to show the "Platform AI" upgrade
 * option in the AI Mode picker. The actual key value is NEVER exposed.
 */
export const PLATFORM_AI_CONFIGURED: boolean =
  typeof process !== "undefined" &&
  !!process.env?.PLATFORM_AI_API_KEY &&
  process.env.PLATFORM_AI_API_KEY.length > 0;
