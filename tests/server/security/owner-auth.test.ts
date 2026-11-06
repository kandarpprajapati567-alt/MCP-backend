import assert from "node:assert/strict";
import test from "node:test";
import {createOwnerSession,OWNER_SESSION_TTL_SECONDS,verifyOwnerMasterToken,verifyOwnerSession} from "../../../src/server/security/owner-auth";
const original=process.env.FS_OWNER_TOKEN;
test.before(()=>{process.env.FS_OWNER_TOKEN="test-owner-token-which-is-long-enough-1234567890";});
test.after(()=>{if(original===undefined)delete process.env.FS_OWNER_TOKEN;else process.env.FS_OWNER_TOKEN=original;});
test("owner master token is checked with exact matching",()=>{assert.equal(verifyOwnerMasterToken(process.env.FS_OWNER_TOKEN),true);assert.equal(verifyOwnerMasterToken("wrong-owner-token-which-is-long-enough-1234567890"),false);});
test("owner session lasts exactly four days",()=>{const now=Date.UTC(2026,0,1);const session=createOwnerSession(now);assert.equal(OWNER_SESSION_TTL_SECONDS,345600);assert.equal(session.expiresAt,Math.floor(now/1000)+345600);assert.equal(verifyOwnerSession(session.token,now),true);assert.equal(verifyOwnerSession(session.token,now+345599000),true);assert.equal(verifyOwnerSession(session.token,now+345600000),false);});
test("owner session rejects tampering and malformed values",()=>{const session=createOwnerSession();assert.equal(verifyOwnerSession(session.token+"x"),false);assert.equal(verifyOwnerSession("not.a.session"),false);});
