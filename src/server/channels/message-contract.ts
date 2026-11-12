import { createHash } from "node:crypto";

export const CHANNEL_MESSAGE_VERSION = 1 as const;
export const CHANNEL_MESSAGE_MAX_TEXT_LENGTH = 8_000;

export const CHANNEL_IDS = ["telegram", "discord", "whatsapp", "website", "android"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/**
 * Internal, authenticated message contract shared by every channel adapter.
 *
 * IMPORTANT: construct this only after the adapter has verified the provider's
 * webhook/interaction authenticity and resolved the external sender to an
 * explicitly linked Futuristic System owner. Never cast a raw webhook body to
 * this type and never trust ownerId or sender identity supplied by a provider.
 *
 * Version 1 deliberately supports text only. Attachments need a separate
 * quarantine, scanning, storage and bounded-reference contract before use.
 */
export type NormalizedChannelMessageV1 = {
  version: typeof CHANNEL_MESSAGE_VERSION;
  channel: ChannelId;
  providerEventId: string;
  ownerId: string;
  externalUserId: string;
  conversationId: string;
  text: string;
  receivedAt: string;
};

export type ChannelMessageParseResult =
  | { ok: true; value: NormalizedChannelMessageV1 }
  | { ok: false; error: string };

const ALLOWED_KEYS = new Set([
  "version",
  "channel",
  "providerEventId",
  "ownerId",
  "externalUserId",
  "conversationId",
  "text",
  "receivedAt",
]);
const OPAQUE_ID = /^[^\u0000-\u001f\u007f]{1,256}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID.test(value) && value.trim() === value;
}

/**
 * Validates the internal envelope at the gateway/Agent boundary.
 * Unknown fields fail closed so raw provider payloads cannot smuggle policy
 * flags, credentials, tool arguments or arbitrary attachment data downstream.
 */
export function parseNormalizedChannelMessageV1(input: unknown): ChannelMessageParseResult {
  if (!isRecord(input)) return { ok: false, error: "A channel message object is required." };
  if (Object.keys(input).some((key) => !ALLOWED_KEYS.has(key))) {
    return { ok: false, error: "Channel message contains unsupported fields." };
  }
  if (input.version !== CHANNEL_MESSAGE_VERSION) {
    return { ok: false, error: "Unsupported channel message version." };
  }
  if (typeof input.channel !== "string" || !CHANNEL_IDS.includes(input.channel as ChannelId)) {
    return { ok: false, error: "Unsupported channel." };
  }
  if (!isOpaqueId(input.providerEventId)) return { ok: false, error: "Invalid provider event ID." };
  if (typeof input.ownerId !== "string" || !UUID.test(input.ownerId)) return { ok: false, error: "Invalid resolved owner ID." };
  if (!isOpaqueId(input.externalUserId)) return { ok: false, error: "Invalid linked external user ID." };
  if (!isOpaqueId(input.conversationId)) return { ok: false, error: "Invalid conversation ID." };
  if (typeof input.text !== "string" || input.text.trim().length === 0 ||
      input.text.length > CHANNEL_MESSAGE_MAX_TEXT_LENGTH) {
    return { ok: false, error: "Message text must be non-empty and within the size limit." };
  }
  if (typeof input.receivedAt !== "string" || !ISO_TIMESTAMP.test(input.receivedAt) ||
      !Number.isFinite(Date.parse(input.receivedAt))) {
    return { ok: false, error: "Invalid message received timestamp." };
  }

  return {
    ok: true,
    value: {
      version: CHANNEL_MESSAGE_VERSION,
      channel: input.channel as ChannelId,
      providerEventId: input.providerEventId,
      ownerId: input.ownerId,
      externalUserId: input.externalUserId,
      conversationId: input.conversationId,
      text: input.text,
      receivedAt: input.receivedAt,
    },
  };
}

function hashParts(parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(String(Buffer.byteLength(part, "utf8")));
    hash.update(":");
    hash.update(part);
    hash.update("|");
  }
  return hash.digest("hex");
}

/** Stable event key for replay/deduplication, scoped to the provider channel. */
export function createChannelEventDeduplicationKey(channel: ChannelId, providerEventId: string): string {
  return hashParts(["channel-event-v1", channel, providerEventId]);
}

/**
 * Stable conversation scope. Including owner, channel, sender and conversation
 * prevents two external users/channels from sharing the same Agent session.
 */
export function createChannelSessionScopeKey(message: NormalizedChannelMessageV1): string {
  return hashParts([
    "channel-session-v1",
    message.ownerId,
    message.channel,
    message.externalUserId,
    message.conversationId,
  ]);
}
