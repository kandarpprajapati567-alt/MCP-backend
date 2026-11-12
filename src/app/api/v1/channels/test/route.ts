import { NextResponse } from "next/server";
import { readJsonBody } from "@/server/http/read-json";
import {
  runChannelContractSelfTests,
  type ChannelContractCheckId,
} from "@/server/channels/message-contract";
import { verifyOwnerRequest } from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const CHECK_IDS: ChannelContractCheckId[] = [
  "valid_envelope",
  "reject_unknown_fields",
  "event_deduplication",
  "session_isolation",
  "timestamp_validation",
];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

/** Runs deterministic, no-network channel gateway checks for the authenticated owner. */
export async function POST(request: Request) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);

  const parsed = await readJsonBody(request, 1024);
  if (!parsed.ok) return parsed.reason === "too_large"
    ? json({ error: "Request body too large." }, 413)
    : json({ error: "Invalid JSON body." }, 400);

  const body = parsed.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "A JSON object is required." }, 400);
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "testId")) {
    return json({ error: "Unsupported test request fields." }, 400);
  }
  const testId = input.testId;
  if (testId !== undefined && testId !== "all" &&
      (typeof testId !== "string" || !CHECK_IDS.includes(testId as ChannelContractCheckId))) {
    return json({ error: "Unknown channel contract test ID." }, 400);
  }

  const results = runChannelContractSelfTests(
    testId === undefined || testId === "all" ? undefined : testId as ChannelContractCheckId,
  );
  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.length - passed;
  return json({
    summary: { total: results.length, passed, failed, status: failed === 0 ? "passed" : "failed" },
    results,
    note: "These deterministic checks validate the internal message contract only. They do not verify live provider webhooks or execute Agent tasks.",
  }, failed === 0 ? 200 : 500);
}
