import assert from "node:assert/strict";
import test from "node:test";
import { parseAIUsageStatus } from "../../../../src/server/ai/usage/usage-status";

const validRow = {
  minute_requests_used: 3,
  minute_requests_limit: 10,
  minute_resets_at: "2026-11-06T12:01:00.000Z",
  daily_requests_used: 24,
  daily_requests_limit: 200,
  daily_input_characters_used: 12000,
  daily_input_characters_limit: 2000000,
  daily_output_tokens_used: 4200,
  daily_resets_at: "2026-11-07T00:00:00.000Z",
};

test("parses usage counters and reset boundaries", () => {
  assert.deepEqual(parseAIUsageStatus([validRow]), {
    minute: { requestsUsed: 3, requestsLimit: 10, resetsAt: validRow.minute_resets_at },
    day: {
      requestsUsed: 24,
      requestsLimit: 200,
      inputCharactersUsed: 12000,
      inputCharactersLimit: 2000000,
      outputTokensUsed: 4200,
      resetsAt: validRow.daily_resets_at,
    },
  });
});

test("rejects missing, duplicate, or malformed RPC rows", () => {
  assert.throws(() => parseAIUsageStatus(null));
  assert.throws(() => parseAIUsageStatus([]));
  assert.throws(() => parseAIUsageStatus([validRow, validRow]));
  assert.throws(() => parseAIUsageStatus([{ ...validRow, daily_requests_used: -1 }]));
  assert.throws(() => parseAIUsageStatus([{ ...validRow, minute_resets_at: "invalid" }]));
});

test("rejects unsafe counters and zero limits", () => {
  assert.throws(() => parseAIUsageStatus([{ ...validRow, daily_output_tokens_used: Number.MAX_SAFE_INTEGER + 1 }]));
  assert.throws(() => parseAIUsageStatus([{ ...validRow, daily_requests_limit: 0 }]));
});
