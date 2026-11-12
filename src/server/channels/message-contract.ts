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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID.test(value) && value.trim() === value;
}

function isStrictIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  if (year < 1000 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return false;
  const offset = value.match(/([+-])(\d{2}):(\d{2})$/);
  return !offset || (Number(offset[2]) <= 23 && Number(offset[3]) <= 59);
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
  if (!isStrictIsoTimestamp(input.receivedAt)) {
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

export type ChannelContractCheckId =
  | "valid_envelope"
  | "reject_unknown_fields"
  | "event_deduplication"
  | "session_isolation"
  | "timestamp_validation";

export type ChannelContractCheckResult = {
  id: ChannelContractCheckId;
  name: string;
  status: "passed" | "failed";
  detail: string;
};

const SELF_TEST_MESSAGE: NormalizedChannelMessageV1 = {
  version: 1,
  channel: "telegram",
  providerEventId: "self-test-event-1",
  ownerId: "00000000-0000-4000-8000-000000000001",
  externalUserId: "self-test-user",
  conversationId: "self-test-conversation",
  text: "Run channel gateway contract self-test",
  receivedAt: "2026-11-12T18:00:00.000Z",
};

/** Deterministic, no-network checks exposed through the owner-authenticated Test Center API. */
export function runChannelContractSelfTests(testId?: ChannelContractCheckId): ChannelContractCheckResult[] {
  const checks: Array<{ id: ChannelContractCheckId; name: string; run: () => boolean; detail: string }> = [
    {
      id: "valid_envelope",
      name: "Valid normalized message",
      run: () => parseNormalizedChannelMessageV1(SELF_TEST_MESSAGE).ok,
      detail: "A correctly scoped v1 message is accepted.",
    },
    {
      id: "reject_unknown_fields",
      name: "Reject provider payload leakage",
      run: () => !parseNormalizedChannelMessageV1({ ...SELF_TEST_MESSAGE, accessToken: "must-not-pass" }).ok,
      detail: "Unknown fields, credentials and unreviewed provider data are rejected.",
    },
    {
      id: "event_deduplication",
      name: "Event replay key",
      run: () => {
        const first = createChannelEventDeduplicationKey("telegram", "event-1");
        return first === createChannelEventDeduplicationKey("telegram", "event-1") &&
          first !== createChannelEventDeduplicationKey("discord", "event-1");
      },
      detail: "Repeated provider events map to the same channel-scoped key.",
    },
    {
      id: "session_isolation",
      name: "Conversation isolation",
      run: () => {
        const first = createChannelSessionScopeKey(SELF_TEST_MESSAGE);
        return first !== createChannelSessionScopeKey({ ...SELF_TEST_MESSAGE, externalUserId: "other-user" }) &&
          first !== createChannelSessionScopeKey({ ...SELF_TEST_MESSAGE, channel: "discord" });
      },
      detail: "Different senders and channels cannot share the same session scope.",
    },
    {
      id: "timestamp_validation",
      name: "Strict timestamp validation",
      run: () => !parseNormalizedChannelMessageV1({ ...SELF_TEST_MESSAGE, receivedAt: "2026-02-31T12:00:00Z" }).ok,
      detail: "Impossible calendar dates are rejected.",
    },
  ];
  return checks
    .filter((check) => !testId || check.id === testId)
    .map((check) => {
      try {
        const passed = check.run();
        return { id: check.id, name: check.name, status: passed ? "passed" : "failed", detail: check.detail };
      } catch {
        return { id: check.id, name: check.name, status: "failed", detail: "The self-test threw unexpectedly." };
      }
    });
}
