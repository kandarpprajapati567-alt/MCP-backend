import assert from "node:assert/strict";
import test from "node:test";
import {
  CHANNEL_MESSAGE_MAX_TEXT_LENGTH,
  createChannelEventDeduplicationKey,
  createChannelSessionScopeKey,
  parseNormalizedChannelMessageV1,
  runChannelContractSelfTests,
  type NormalizedChannelMessageV1,
} from "../../../src/server/channels/message-contract";

const validMessage: NormalizedChannelMessageV1 = {
  version: 1,
  channel: "telegram",
  providerEventId: "update-123",
  ownerId: "00000000-0000-4000-8000-000000000001",
  externalUserId: "telegram-user-456",
  conversationId: "chat-789",
  text: "Summarize my latest project status",
  receivedAt: "2026-11-12T18:00:00.000Z",
};

test("accepts a valid versioned message after adapter authentication and identity linking", () => {
  const parsed = parseNormalizedChannelMessageV1(validMessage);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value, validMessage);
});

test("rejects unknown versions, channels, and provider-controlled extra fields", () => {
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, version: 2 }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, channel: "unknown" }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, isOwner: true }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, toolArguments: { shell: "..." } }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, accessToken: "secret" }).ok, false);
});

test("rejects unlinked/invalid identity fields, control characters, and invalid timestamps", () => {
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, ownerId: " " }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, externalUserId: "user\nforged" }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, conversationId: "" }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, receivedAt: "yesterday" }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, receivedAt: "2026-99-99T30:61:61Z" }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, receivedAt: "2026-02-31T12:00:00Z" }).ok, false);
});

test("bounds text and rejects empty messages", () => {
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, text: "  " }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, text: "x".repeat(CHANNEL_MESSAGE_MAX_TEXT_LENGTH + 1) }).ok, false);
  assert.equal(parseNormalizedChannelMessageV1({ ...validMessage, text: "x".repeat(CHANNEL_MESSAGE_MAX_TEXT_LENGTH) }).ok, true);
});

test("event deduplication key is stable and scoped by channel", () => {
  const first = createChannelEventDeduplicationKey("telegram", "event-1");
  assert.equal(first, createChannelEventDeduplicationKey("telegram", "event-1"));
  assert.notEqual(first, createChannelEventDeduplicationKey("discord", "event-1"));
  assert.notEqual(first, createChannelEventDeduplicationKey("telegram", "event-2"));
  assert.equal(first.length, 64);
});

test("session scope isolates owners, channels, senders, and conversations", () => {
  const first = createChannelSessionScopeKey(validMessage);
  assert.equal(first, createChannelSessionScopeKey(validMessage));
  assert.notEqual(first, createChannelSessionScopeKey({ ...validMessage, ownerId: "00000000-0000-4000-8000-000000000002" }));
  assert.notEqual(first, createChannelSessionScopeKey({ ...validMessage, channel: "discord" }));
  assert.notEqual(first, createChannelSessionScopeKey({ ...validMessage, externalUserId: "another-user" }));
  assert.notEqual(first, createChannelSessionScopeKey({ ...validMessage, conversationId: "another-chat" }));
  assert.equal(first.length, 64);
});

test("rejects non-object input", () => {
  assert.equal(parseNormalizedChannelMessageV1(null).ok, false);
  assert.equal(parseNormalizedChannelMessageV1([]).ok, false);
  assert.equal(parseNormalizedChannelMessageV1("message").ok, false);
});


test("owner Test Center self-tests execute every channel contract check", () => {
  const results = runChannelContractSelfTests();
  assert.equal(results.length, 5);
  assert.ok(results.every((result) => result.status === "passed"));
  assert.equal(runChannelContractSelfTests("session_isolation")[0]?.status, "passed");
  assert.equal(runChannelContractSelfTests("unknown" as never).length, 0);
});
