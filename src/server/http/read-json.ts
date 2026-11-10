export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid_json" };

export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("A positive safe JSON body size limit is required.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(declaredLength)) {
      return { ok: false, reason: "invalid_json" };
    }
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength)) {
      return { ok: false, reason: "invalid_json" };
    }
    if (parsedLength > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, reason: "invalid_json" };

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value) continue;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
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
