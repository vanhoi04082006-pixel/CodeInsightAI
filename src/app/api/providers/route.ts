// GET /api/providers — List the user's saved AI providers (mask API keys!)
// Returns only the metadata the frontend needs — never the raw API key.
//
// This is the canonical, production-safe way for the frontend to learn which
// providers the user has configured. The actual encrypted keys stay on the
// server and are only decrypted at request time inside /api/chat.
//
// Response shape:
//   {
//     providers: [{
//       id, providerId, label, maskedKey, baseUrl, model,
//       temperature, maxTokens, streaming, enabled, createdAt
//     }],
//     platformAiConfigured: boolean   // whether the server has a Platform AI key
//   }
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { decrypt, maskApiKey } from "@/lib/crypto";
import { PLATFORM_AI_CONFIGURED } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const creds = await db.providerCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Map to safe (masked) shape — never leak raw API keys to the client
    const providers = creds.map((c) => {
      let maskedKey = "••••••••";
      try {
        maskedKey = maskApiKey(decrypt(c.encryptedApiKey));
      } catch {
        // Decryption can fail if NEXTAUTH_SECRET changed — surface a hint
        maskedKey = "•••• (decryption failed)";
      }
      return {
        id: c.id,
        providerId: c.providerId,
        label: c.label,
        maskedKey,
        baseUrl: c.baseUrl,
        model: c.model,
        temperature: c.temperature,
        maxTokens: c.maxTokens,
        streaming: c.streaming,
        enabled: c.enabled,
        createdAt: c.createdAt,
      };
    });

    return NextResponse.json({
      providers,
      platformAiConfigured: PLATFORM_AI_CONFIGURED,
    });
  } catch (e) {
    console.error("[/api/providers GET]", e);
    return NextResponse.json({ error: "Failed to load providers" }, { status: 500 });
  }
}
