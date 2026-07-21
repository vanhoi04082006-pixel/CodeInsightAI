// POST /api/providers/credentials — Save encrypted API key to DB
// GET  /api/providers/credentials — List user's credentials (masked keys)
// DELETE /api/providers/credentials?id=xxx — Delete credential
//
// All routes use session.user.id (the User.id cuid) — never email — so the
// Prisma FK constraint on ProviderCredential.userId is satisfied.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";
import { requireUserId } from "@/lib/auth";

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

    // Return masked keys — never expose raw API keys to frontend
    const masked = creds.map(c => ({
      id: c.id,
      providerId: c.providerId,
      label: c.label,
      maskedKey: maskApiKey(decrypt(c.encryptedApiKey)),
      baseUrl: c.baseUrl,
      model: c.model,
      temperature: c.temperature,
      maxTokens: c.maxTokens,
      streaming: c.streaming,
      enabled: c.enabled,
      createdAt: c.createdAt,
    }));

    return NextResponse.json({ credentials: masked });
  } catch (e) {
    console.error("[/api/providers/credentials GET]", e);
    return NextResponse.json({ error: "Failed to load credentials" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { providerId, label, apiKey, baseUrl, model, temperature, maxTokens, streaming, enabled } = body;

    if (!providerId || !apiKey) {
      return NextResponse.json({ error: "providerId and apiKey are required" }, { status: 400 });
    }

    const encrypted = encrypt(apiKey);

    const cred = await db.providerCredential.upsert({
      where: {
        userId_providerId_label: {
          userId,
          providerId,
          label: label || providerId,
        },
      },
      create: {
        userId,
        providerId,
        label: label || providerId,
        encryptedApiKey: encrypted,
        baseUrl: baseUrl || "",
        model: model || "",
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 4096,
        streaming: streaming ?? true,
        enabled: enabled ?? true,
      },
      update: {
        encryptedApiKey: encrypted,
        baseUrl: baseUrl || "",
        model: model || "",
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 4096,
        streaming: streaming ?? true,
        enabled: enabled ?? true,
      },
    });

    return NextResponse.json({
      success: true,
      id: cred.id,
      maskedKey: maskApiKey(apiKey),
    });
  } catch (e) {
    console.error("[/api/providers/credentials POST]", e);
    return NextResponse.json({ error: "Failed to save credential" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await db.providerCredential.deleteMany({
      where: { id, userId },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[/api/providers/credentials DELETE]", e);
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
  }
}
