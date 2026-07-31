import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "CodeInsight AI API",
    version: "1.0.0",
    status: "ok",
    docs: "https://github.com/vanhoi04082006-pixel/CodeInsightAI",
  });
}
