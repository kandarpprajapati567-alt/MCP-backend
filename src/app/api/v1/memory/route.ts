import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const SOURCES = ["manual", "agent", "task", "android", "import"] as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const url = new URL(request.url);
  const namespace = url.searchParams.get("namespace") ?? "default";
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "25");
  const limit = Number.isInteger(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 25;
  if (namespace.length < 1 || namespace.length > 80 || query.length > 160) {
    return json({ error: "Invalid namespace or search query." }, 400);
  }

  try {
    const admin = createAdminClient();
    let builder = admin.from("agent_memories")
      .select("id,namespace,memory_key,content,metadata,source,importance,created_at,updated_at")
      .eq("owner_id", PERSONAL_OWNER_ID)
      .eq("namespace", namespace)
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (query) builder = builder.ilike("content", "%" + query.replace(/[%,_]/g, "\\$&") + "%");
    const { data, error } = await builder;
    if (error) return json({ error: "Memory search is unavailable." }, 503);
    return json({ memories: data ?? [], namespace, query, count: data?.length ?? 0 });
  } catch {
    return json({ error: "Memory search is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!isRecord(body)) return json({ error: "A JSON object is required." }, 400);

  const namespace = body.namespace === undefined ? "default" : body.namespace;
  const key = body.key;
  const content = body.content;
  const source = body.source === undefined ? "manual" : body.source;
  const importance = body.importance === undefined ? 3 : body.importance;
  const metadata = body.metadata === undefined ? {} : body.metadata;

  if (typeof namespace !== "string" || namespace.trim().length < 1 || namespace.length > 80 ||
      typeof key !== "string" || key.trim().length < 1 || key.length > 160 ||
      typeof content !== "string" || content.trim().length < 1 || content.length > 12000) {
    return json({ error: "namespace, key or content is outside the allowed size." }, 400);
  }
  if (typeof source !== "string" || !SOURCES.includes(source as (typeof SOURCES)[number])) {
    return json({ error: "Unsupported memory source." }, 400);
  }
  if (typeof importance !== "number" || !Number.isInteger(importance) || importance < 1 || importance > 5) {
    return json({ error: "importance must be an integer from 1 to 5." }, 400);
  }
  if (!isRecord(metadata) || Buffer.byteLength(JSON.stringify(metadata), "utf8") > 8000) {
    return json({ error: "metadata must be an object no larger than 8 KB." }, 400);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_memories").upsert({
      owner_id: PERSONAL_OWNER_ID,
      namespace: namespace.trim(),
      memory_key: key.trim(),
      content: content.trim(),
      metadata,
      source,
      importance,
    }, { onConflict: "owner_id,namespace,memory_key" })
      .select("id,namespace,memory_key,content,metadata,source,importance,created_at,updated_at")
      .single();
    if (error || !data) return json({ error: "Memory could not be saved." }, 503);
    return json({ ok: true, memory: data }, 201);
  } catch {
    return json({ error: "Memory could not be saved." }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!isRecord(body) || typeof body.key !== "string" || body.key.length < 1 || body.key.length > 160) {
    return json({ error: "A valid memory key is required." }, 400);
  }
  const namespace = typeof body.namespace === "string" ? body.namespace : "default";
  if (namespace.length < 1 || namespace.length > 80) return json({ error: "Invalid namespace." }, 400);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("agent_memories").delete()
      .eq("owner_id", PERSONAL_OWNER_ID)
      .eq("namespace", namespace)
      .eq("memory_key", body.key)
      .select("id");
    if (error) return json({ error: "Memory could not be deleted." }, 503);
    return json({ ok: true, deleted: data?.length ?? 0 });
  } catch {
    return json({ error: "Memory could not be deleted." }, 503);
  }
}
