export type JsonBodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 413 | 415; error: string };

export async function readJsonBody<T>(
  request: Request,
  maxBytes = 16_384,
): Promise<JsonBodyResult<T>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return { ok: false, status: 415, error: "Zahtjev mora biti u JSON formatu." };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413, error: "Zahtjev je prevelik." };
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          return { ok: false, status: 413, error: "Zahtjev je prevelik." };
        }
        chunks.push(value);
      }
    }
  } catch {
    return { ok: false, status: 400, error: "Podaci nisu čitljivi." };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, status: 400, error: "Podaci nisu čitljivi." };
  }

  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, status: 400, error: "Podaci nisu čitljivi." };
    }
    return { ok: true, value: value as T };
  } catch {
    return { ok: false, status: 400, error: "Podaci nisu čitljivi." };
  }
}
