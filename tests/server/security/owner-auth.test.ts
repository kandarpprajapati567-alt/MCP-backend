import assert from "node:assert/strict";
import test from "node:test";
import {
  createOwnerSessionToken,
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_TTL_SECONDS,
  PERSONAL_OWNER_ID,
  verifyOwnerMasterToken,
  verifyOwnerRequest,
  verifyOwnerSessionToken,
} from "../../../src/server/security/owner-auth";

const original = process.env.FS_OWNER_TOKEN;
const validToken = "test-owner-token-which-is-long-enough-1234567890";

test.before(() => {
  process.env.FS_OWNER_TOKEN = validToken;
});

test.after(() => {
  if (original === undefined) delete process.env.FS_OWNER_TOKEN;
  else process.env.FS_OWNER_TOKEN = original;
});

test("owner master token requires an exact match", () => {
  assert.equal(verifyOwnerMasterToken(validToken), true);
  assert.equal(verifyOwnerMasterToken("wrong-owner-token-which-is-long-enough-1234567890"), false);
  assert.equal(verifyOwnerMasterToken("short"), false);
});

test("owner API requests accept the master token directly", () => {
  const request = new Request("https://backend.example/api/v1/tools", {
    headers: { "x-fs-owner-token": validToken, origin: "https://backend.example" },
  });
  assert.equal(verifyOwnerRequest(request), PERSONAL_OWNER_ID);
});

test("owner API requests accept a Bearer master token", () => {
  const request = new Request("https://backend.example/api/v1/tools", {
    headers: { authorization: "Bearer " + validToken },
  });
  assert.equal(verifyOwnerRequest(request), PERSONAL_OWNER_ID);
});

test("owner API requests accept a valid short-lived HttpOnly session cookie", () => {
  const now = 1_800_000_000_000;
  const session = createOwnerSessionToken(validToken, now);
  assert.ok(session);
  const request = new Request("https://backend.example/api/v1/tools", {
    headers: {
      cookie: OWNER_SESSION_COOKIE + "=" + session,
      origin: "https://backend.example",
    },
  });
  assert.equal(verifyOwnerRequest(request), PERSONAL_OWNER_ID);
});

test("owner session tokens expire and reject tampering", () => {
  const now = 1_800_000_000_000;
  const session = createOwnerSessionToken(validToken, now);
  assert.ok(session);
  assert.equal(verifyOwnerSessionToken(session, now), true);
  assert.equal(verifyOwnerSessionToken(session, now + (OWNER_SESSION_TTL_SECONDS + 1) * 1000), false);
  assert.equal(verifyOwnerSessionToken(session + "x", now), false);
  assert.equal(verifyOwnerSessionToken("not-a-session", now), false);
});

test("owner session exchange rejects an invalid master token", () => {
  assert.equal(createOwnerSessionToken("wrong-owner-token-which-is-long-enough-1234567890"), null);
});

test("owner API requests reject invalid tokens and cross-origin requests", () => {
  const invalid = new Request("https://backend.example/api/v1/tools", {
    headers: { "x-fs-owner-token": "not-the-owner-token" },
  });
  const crossOrigin = new Request("https://backend.example/api/v1/tools", {
    headers: { "x-fs-owner-token": validToken, origin: "https://attacker.example" },
  });
  assert.equal(verifyOwnerRequest(invalid), null);
  assert.equal(verifyOwnerRequest(crossOrigin), null);
});
