export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid_json" };

export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new Error("A positive JSON body size limit is required.");
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, reason: "invalid_json" };

  const decoder = new TextDecoder();
  let text = "";
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "invalid_json" };
  } finally {
    try { reader.releaseLock(); } catch { /* The stream may already be released. */ }
  }
}
