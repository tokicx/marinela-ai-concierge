import { env } from "cloudflare:workers";
import { sha256Base64Url } from "./oauth-crypto";

export function requestClientIp(request: Request) {
  return request.headers.get("CF-Connecting-IP")?.trim() || null;
}

export async function consumeRateLimit(input: {
  scope: string;
  identifier: string | null;
  limit: number;
  windowSeconds: number;
  failureMode?: "allow" | "deny";
}) {
  if (!input.identifier) return input.failureMode !== "deny";
  const windowMilliseconds = input.windowSeconds * 1000;
  const windowStartMs = Math.floor(Date.now() / windowMilliseconds) * windowMilliseconds;
  const windowStart = new Date(windowStartMs).toISOString();
  const expiresAt = new Date(windowStartMs + windowMilliseconds).toISOString();
  const key = await sha256Base64Url(`${input.scope}:${windowStart}:${input.identifier}`);
  const now = new Date().toISOString();

  try {
    const row = await env.DB.prepare(
      "INSERT INTO request_rate_limits (key,scope,window_start,expires_at,attempts,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1,updated_at = excluded.updated_at RETURNING attempts",
    )
      .bind(key, input.scope, windowStart, expiresAt, now)
      .first<{ attempts: number }>();

    if (Math.random() < 0.02) {
      await env.DB.prepare("DELETE FROM request_rate_limits WHERE expires_at < ?")
        .bind(now)
        .run()
        .catch(() => undefined);
    }
    return (row?.attempts ?? 1) <= input.limit;
  } catch {
    return input.failureMode !== "deny";
  }
}
