import { NextResponse } from "next/server";
import { listAvailableMediaModels, MEDIA_MODEL_CATALOG } from "@/server/media/model-catalog";
import { verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({
    available: listAvailableMediaModels(),
    planned: MEDIA_MODEL_CATALOG.filter((model) => model.status === "planned"),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
