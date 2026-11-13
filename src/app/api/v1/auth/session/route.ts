import { NextResponse } from "next/server";
import { readJsonBody } from "@/server/http/read-json";
import {
  createOwnerSessionToken,
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_TTL_SECONDS,
  verifyOwnerRequest,
} from "@/server/security/owner-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

/** Exchange the master token once for a short-lived, HttpOnly same-site owner session. */
export async function POST(request: Request) {
  const parsed = await readJsonBody(request, 2048);
  if (!parsed.ok) return json({ error: parsed.reason === "too_large" ? "Request body too large." : "Invalid JSON body." }, parsed.reason === "too_large" ? 413 : 400);
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return json({ error: "A JSON object is required." }, 400);
  }

  const input = parsed.value as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !Object.hasOwn(input, "token")) {
    return json({ error: "Only the owner token may be supplied." }, 400);
  }

  const session = createOwnerSessionToken(input.token);
  if (!session) return json({ error: "Unauthorized." }, 401);

  const response = json({ authenticated: true, expiresIn: OWNER_SESSION_TTL_SECONDS });
  response.cookies.set(OWNER_SESSION_COOKIE, session, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: OWNER_SESSION_TTL_SECONDS,
  });
  return response;
}

/** Report whether the browser already has a valid owner session. */
export async function GET(request: Request) {
  return json({ authenticated: verifyOwnerRequest(request) !== null });
}

/** Revoke the browser session without changing the owner master credential. */
export async function DELETE() {
  const response = json({ authenticated: false });
  response.cookies.set(OWNER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
