import assert from "node:assert/strict";
import test from "node:test";
import {
  isTelegramUserAllowed,
  parseTelegramPrivateTextUpdate,
  verifyTelegramWebhookSecret,
} from "../../../src/server/channels/telegram-inbound";

const validUpdate = {
  update_id: 1001,
  message: {
    message_id: 22,
    date: 1794500000,
    from: { id: 123456789, is_bot: false },
    chat: { id: 123456789, type: "private" },
    text: "Check my Agent task",
  },
};

test("verifies Telegram webhook secret only when configured and equal", () => {
  const secret = "a".repeat(40);
  assert.equal(verifyTelegramWebhookSecret(secret, secret), true);
  assert.equal(verifyTelegramWebhookSecret("b".repeat(40), secret), false);
  assert.equal(verifyTelegramWebhookSecret(secret, undefined), false);
  assert.equal(verifyTelegramWebhookSecret("short", "short"), false);
  assert.equal(verifyTelegramWebhookSecret(null, secret), false);
  // Equal UTF-16 string lengths can still have different UTF-8 byte lengths.
  assert.equal(verifyTelegramWebhookSecret("é".repeat(32), secret), false);
});

test("Telegram allowlist requires an exact numeric sender ID", () => {
  assert.equal(isTelegramUserAllowed("123456789", "111, 123456789"), true);
  assert.equal(isTelegramUserAllowed("1234567890", "123456789"), false);
  assert.equal(isTelegramUserAllowed("123456789", undefined), false);
  assert.equal(isTelegramUserAllowed("123\n456", "123456"), false);
});

test("parses only a valid private text update", () => {
  const result = parseTelegramPrivateTextUpdate({ ...validUpdate, message: { ...validUpdate.message, from: { ...validUpdate.message.from, first_name: "Test", username: "safe_user", language_code: "en" }, chat: { ...validUpdate.message.chat, first_name: "Test" } } });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, {
    updateId: 1001,
    telegramUserId: "123456789",
    chatId: "123456789",
    text: "Check my Agent task",
  });
});

test("rejects group chats, bots, sender/chat mismatch and unlinked payload fields", () => {
  assert.equal(parseTelegramPrivateTextUpdate({ ...validUpdate, message: { ...validUpdate.message, chat: { id: -1, type: "group" } } }).ok, false);
  assert.equal(parseTelegramPrivateTextUpdate({ ...validUpdate, message: { ...validUpdate.message, from: { id: 123456789, is_bot: true } } }).ok, false);
  assert.equal(parseTelegramPrivateTextUpdate({ ...validUpdate, message: { ...validUpdate.message, chat: { id: 999, type: "private" } } }).ok, false);
  assert.equal(parseTelegramPrivateTextUpdate({ ...validUpdate, secret: "leak" }).ok, false);
  assert.equal(parseTelegramPrivateTextUpdate({ ...validUpdate, message: { ...validUpdate.message, photo: [] } }).ok, false);
});

test("rejects invalid IDs, empty text and oversized messages", () => {
  assert.equal(parseTelegramPrivateTextUpdate({ ...validUpdate, update_id: -1 }).ok, false);
  assert.equal(parseTelegramPrivateTextUpdate({ ...validUpdate, message: { ...validUpdate.message, text: " " } }).ok, false);
  assert.equal(parseTelegramPrivateTextUpdate({ ...validUpdate, message: { ...validUpdate.message, text: "x".repeat(8001) } }).ok, false);
});
