// CodeInsight AI — SPM Serializer (Layer 0)
//
// Serializes/deserializes SemanticProjectModel to/from JSON.
// Used for caching SPM (e.g., in DB or sessionStorage).
//
// Note: SPM is already JSON-serializable (all fields are primitives or arrays).
// This module adds validation + error handling around JSON.parse/stringify.

import type { SemanticProjectModel, Result, AgentError } from "../contracts";
import { SPM_SCHEMA_VERSION } from "./builder";

/**
 * Serialize SPM to JSON string.
 * Safe for storage (DB, sessionStorage, file).
 */
export function serializeSPM(spm: SemanticProjectModel): string {
  return JSON.stringify(spm);
}

/**
 * Deserialize JSON string to SPM.
 * Validates schema version and required fields.
 */
export function deserializeSPM(json: string): Result<SemanticProjectModel> {
  try {
    const parsed = JSON.parse(json);

    // Validate required fields
    if (!parsed || typeof parsed !== "object") {
      return err("SPM_NOT_INITIALIZED", "Deserialized data is not an object");
    }

    if (!parsed.repoOwner || !parsed.repoName) {
      return err("SPM_NOT_INITIALIZED", "SPM missing repoOwner or repoName");
    }

    if (!Array.isArray(parsed.files) || !Array.isArray(parsed.symbols)) {
      return err("SPM_NOT_INITIALIZED", "SPM missing files or symbols arrays");
    }

    // Check schema version — if mismatch, still return data but caller should rebuild
    if (parsed.schemaVersion !== SPM_SCHEMA_VERSION) {
      // Don't fail — caller can check schemaVersion and rebuild if needed
      console.warn(
        `[SPM] Schema version mismatch: expected ${SPM_SCHEMA_VERSION}, got ${parsed.schemaVersion}. ` +
        "Data may be stale — consider rebuilding SPM.",
      );
    }

    return { ok: true, value: parsed as SemanticProjectModel };
  } catch (e) {
    return err(
      "SPM_NOT_INITIALIZED",
      `Failed to deserialize SPM: ${e instanceof Error ? e.message : String(e)}`,
      { error: e },
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function err(code: string, message: string, details?: unknown): { ok: false; error: AgentError } {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
      recoverable: false,
    },
  };
}
