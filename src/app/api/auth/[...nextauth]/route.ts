import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { isAuthConfigured } from "@/server/env";

export const runtime = "nodejs";

function unavailable() {
  return Response.json(
    { error: "Authentication is not configured. Please contact the site operator." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  return isAuthConfigured() ? handlers.GET(request) : unavailable();
}

export async function POST(request: NextRequest) {
  return isAuthConfigured() ? handlers.POST(request) : unavailable();
}
