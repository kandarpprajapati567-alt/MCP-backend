import { timingSafeEqual } from "node:crypto";
import { CHANNEL_MESSAGE_MAX_TEXT_LENGTH } from "./message-contract";

export type TelegramInboundMessage = {
  updateId: number;
  telegramUserId: string;
  chatId: string;
  text: string;
};

export type TelegramParseResult =
  | { ok: true; value: TelegramInboundMessage }
  | { ok: false; error: string };

/** Telegram sends this secret in X-Telegram-Bot-Api-Secret-Token. */
export function verifyTelegramWebhookSecret(
  supplied: string | null,
  expected: string | undefined,
): boolean {
  if (!supplied || !expected || expected.length < 32 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied, "utf8"), Buffer.from(expected, "utf8"));
}

/** Explicit owner-approved numeric Telegram user IDs; never accept IDs from webhook data as owner identity. */
export function isTelegramUserAllowed(
  telegramUserId: string,
  allowlist: string | undefined,
): boolean {
  if (!/^\d{1,20}$/.test(telegramUserId) || !allowlist) return false;
  const allowed = new Set(allowlist.split(",").map((id) => id.trim()).filter((id) => /^\d{1,20}$/.test(id)));
  return allowed.has(telegramUserId);
}

/**
 * Accept only direct private text messages. Group chats, bot senders, edited
 * messages, callbacks, attachments and unknown fields are intentionally
 * rejected until their separate consent and safety contracts exist.
 */
export function parseTelegramPrivateTextUpdate(input: unknown): TelegramParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Telegram update must be an object." };
  }
  const update = input as Record<string, unknown>;
  if (Object.keys(update).some((key) => key !== "update_id" && key !== "message")) {
    return { ok: false, error: "Unsupported Telegram update type." };
  }
  if (!Number.isSafeInteger(update.update_id) || (update.update_id as number) < 0) {
    return { ok: false, error: "Invalid Telegram update ID." };
  }
  const message = update.message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { ok: false, error: "A Telegram message is required." };
  }
  const record = message as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["message_id", "from", "chat", "date", "text"].includes(key))) {
    return { ok: false, error: "Unsupported Telegram message fields." };
  }
  if (!Number.isSafeInteger(record.message_id) || (record.message_id as number) < 0) {
    return { ok: false, error: "Invalid Telegram message ID." };
  }
  if (!Number.isSafeInteger(record.date) || (record.date as number) < 0) {
    return { ok: false, error: "Invalid Telegram message date." };
  }
  const from = record.from;
  const chat = record.chat;
  if (!from || typeof from !== "object" || Array.isArray(from) ||
      !chat || typeof chat !== "object" || Array.isArray(chat)) {
    return { ok: false, error: "Telegram sender and chat are required." };
  }
  const sender = from as Record<string, unknown>;
  const conversation = chat as Record<string, unknown>;
  if (Object.keys(sender).some((key) => !["id", "is_bot", "first_name", "last_name", "username", "language_code", "is_premium", "added_to_attachment_menu"].includes(key)) ||
      Object.keys(conversation).some((key) => !["id", "type", "first_name", "last_name", "username"].includes(key))) {
    return { ok: false, error: "Unsupported Telegram identity fields." };
  }
  if (!Number.isSafeInteger(sender.id) || (sender.id as number) <= 0 ||
      sender.is_bot !== false || !Number.isSafeInteger(conversation.id) ||
      (conversation.id as number) <= 0 || conversation.type !== "private" ||
      sender.id !== conversation.id) {
    return { ok: false, error: "Only a human sender in their own private chat is supported." };
  }
  if (typeof record.text !== "string" || !record.text.trim() ||
      record.text.length > CHANNEL_MESSAGE_MAX_TEXT_LENGTH) {
    return { ok: false, error: "Telegram text must be non-empty and within the message size limit." };
  }
  return {
    ok: true,
    value: {
      updateId: update.update_id as number,
      telegramUserId: String(sender.id),
      chatId: String(conversation.id),
      text: record.text,
    },
  };
}
