export interface AIUsageStatus {
  minute: { requestsUsed: number; requestsLimit: number; resetsAt: string };
  day: {
    requestsUsed: number;
    requestsLimit: number;
    inputCharactersUsed: number;
    inputCharactersLimit: number;
    outputTokensUsed: number;
    resetsAt: string;
  };
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseAIUsageStatus(data: unknown): AIUsageStatus {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== "object") {
    throw new Error("AI usage status returned an invalid response.");
  }

  const row = data[0] as Record<string, unknown>;
  const numericFields = [
    "minute_requests_used",
    "minute_requests_limit",
    "daily_requests_used",
    "daily_requests_limit",
    "daily_input_characters_used",
    "daily_input_characters_limit",
    "daily_output_tokens_used",
  ];
  if (
    numericFields.some((field) => !nonNegativeSafeInteger(row[field])) ||
    !validTimestamp(row.minute_resets_at) ||
    !validTimestamp(row.daily_resets_at) ||
    (row.minute_requests_limit as number) < 1 ||
    (row.daily_requests_limit as number) < 1 ||
    (row.daily_input_characters_limit as number) < 1
  ) {
    throw new Error("AI usage status returned an invalid response.");
  }

  return {
    minute: {
      requestsUsed: row.minute_requests_used as number,
      requestsLimit: row.minute_requests_limit as number,
      resetsAt: row.minute_resets_at,
    },
    day: {
      requestsUsed: row.daily_requests_used as number,
      requestsLimit: row.daily_requests_limit as number,
      inputCharactersUsed: row.daily_input_characters_used as number,
      inputCharactersLimit: row.daily_input_characters_limit as number,
      outputTokensUsed: row.daily_output_tokens_used as number,
      resetsAt: row.daily_resets_at,
    },
  };
}
