// /api/admin/policies — Admin manages the policy catalog.
// GET  — list all configured policies + unconfigured catalog entries (so
//        the UI can render a "configure" button for each catalog type).
// POST — upsert a policy: { type, enabled, config }. If a row with the
//        given `type` already exists, it's updated; otherwise a new row
//        is created (one row per type — admins cannot have two
//        `max-files` policies; they edit the existing one).
//
// Catalog: see src/lib/policies/types.ts POLICY_CATALOG (8 fixed types).
// The admin cannot add new policy types — only enable/disable + edit
// the config of catalog entries. This is a deliberate security trade-off:
// no arbitrary eval, no admin-supplied code.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";
import {
  POLICY_CATALOG,
  POLICY_CATALOG_BY_TYPE,
  defaultConfigForType,
  isPolicyType,
  type PolicyType,
} from "@/lib/policies/types";
import { clearPolicyCache } from "@/lib/policies/policy-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list all configured policies + unconfigured catalog entries.
// Returns `{ policies: [...], catalog: POLICY_CATALOG }`. The UI merges
// them: for each catalog entry, show the configured policy if it exists,
// else show an "unconfigured" card with a "Configure" button.
export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const rows = await db.policy.findMany({ orderBy: { createdAt: "asc" } });

    const policiesByType = new Map<string, any>();
    for (const r of rows) {
      let config: Record<string, any> = {};
      try {
        config = r.config ? JSON.parse(r.config) : {};
      } catch {
        // Malformed JSON — treat as empty (the UI will re-save to fix).
        config = {};
      }
      policiesByType.set(r.type, {
        id: r.id,
        type: r.type,
        enabled: r.enabled,
        config,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      });
    }

    // Merge catalog + DB rows: one entry per catalog type, with the DB
    // row's `enabled` + `config` if configured, else `enabled: false` +
    // default config (so the UI's "Configure" form is pre-filled).
    const merged = POLICY_CATALOG.map((entry) => {
      const configured = policiesByType.get(entry.type);
      if (configured) {
        return {
          ...configured,
          label: entry.label,
          description: entry.description,
          configSchema: entry.configSchema,
          configured: true,
        };
      }
      return {
        id: null,
        type: entry.type,
        enabled: false,
        config: defaultConfigForType(entry.type),
        createdAt: null,
        updatedAt: null,
        label: entry.label,
        description: entry.description,
        configSchema: entry.configSchema,
        configured: false,
      };
    });

    return NextResponse.json({
      policies: merged,
      catalog: POLICY_CATALOG,
    });
  } catch (e) {
    console.error("[/api/admin/policies GET]", e);
    return NextResponse.json({ error: "Failed to load policies" }, { status: 500 });
  }
}

// POST — upsert a policy by `type`.
// Body: { type: PolicyType, enabled: boolean, config: Record<string, any> }
// One row per `type` — admins cannot have two `max-files` policies.
// On success, clears the in-memory policy cache so the new config takes
// effect on the next request (no 60s wait).
export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const body = await req.json();
    const { type, enabled, config } = body as {
      type: string;
      enabled?: boolean;
      config?: Record<string, any>;
    };

    // Validate: `type` must be in the fixed catalog (no arbitrary types).
    if (!type || !isPolicyType(type)) {
      return NextResponse.json(
        { error: `Unknown policy type: ${type}. Must be one of: ${POLICY_CATALOG.map((e) => e.type).join(", ")}` },
        { status: 400 },
      );
    }
    const policyType = type as PolicyType;
    const catalogEntry = POLICY_CATALOG_BY_TYPE[policyType];

    // Validate + coerce config against the catalog's configSchema.
    // Each field's value is coerced to its declared type; unknown keys
    // are dropped (defense-in-depth — the UI shouldn't send extras, but
    // a malicious admin payload shouldn't be able to inject junk into
    // the JSON column either).
    const safeConfig: Record<string, any> = {};
    for (const [key, field] of Object.entries(catalogEntry.configSchema)) {
      const raw = config?.[key];
      if (raw === undefined || raw === null || raw === "") {
        safeConfig[key] = field.default;
        continue;
      }
      if (field.type === "number") {
        const n = Number(raw);
        safeConfig[key] = Number.isFinite(n) ? n : field.default;
      } else if (field.type === "boolean") {
        safeConfig[key] = Boolean(raw);
      } else {
        // string — coerce + cap length to prevent abuse.
        const s = String(raw);
        safeConfig[key] = s.length > 500 ? s.slice(0, 500) : s;
      }
    }

    const isEnabled = enabled !== undefined ? Boolean(enabled) : true;

    // Upsert by `type` (no unique constraint on `type` in the schema, but
    // the admin UI only ever creates one row per type — we enforce it here
    // by looking up the existing row first).
    const existing = await db.policy.findFirst({ where: { type: policyType } });
    let row;
    if (existing) {
      row = await db.policy.update({
        where: { id: existing.id },
        data: {
          enabled: isEnabled,
          config: JSON.stringify(safeConfig),
        },
      });
    } else {
      row = await db.policy.create({
        data: {
          type: policyType,
          enabled: isEnabled,
          config: JSON.stringify(safeConfig),
        },
      });
    }

    // Invalidate the in-memory cache so the new config takes effect on
    // the next /api/analyze or /api/analyze/ai-pass request.
    clearPolicyCache();

    await logAdminAction(adminId, "update_policy", null, {
      policyType,
      enabled: isEnabled,
      config: safeConfig,
    });

    return NextResponse.json({
      success: true,
      policy: {
        id: row.id,
        type: row.type,
        enabled: row.enabled,
        config: safeConfig,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("[/api/admin/policies POST]", e);
    return NextResponse.json({ error: "Failed to save policy" }, { status: 500 });
  }
}

// DELETE — disable + clear config for a policy type (or hard-delete the row).
// `?type=max-files` → resets to unconfigured (deletes the row). The catalog
// entry remains — the UI will show it as "unconfigured" with a "Configure"
// button. Safer than just toggling `enabled: false` because it also wipes
// the config (no stale rules lingering in the DB).
export async function DELETE(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const type = req.nextUrl.searchParams.get("type");
    if (!type || !isPolicyType(type)) {
      return NextResponse.json(
        { error: `Unknown or missing policy type: ${type}` },
        { status: 400 },
      );
    }
    const policyType = type as PolicyType;

    await db.policy.deleteMany({ where: { type: policyType } });
    clearPolicyCache();

    await logAdminAction(adminId, "delete_policy", null, { policyType });

    return NextResponse.json({ success: true, policyType });
  } catch (e) {
    console.error("[/api/admin/policies DELETE]", e);
    return NextResponse.json({ error: "Failed to delete policy" }, { status: 500 });
  }
}
