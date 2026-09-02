import { env } from "cloudflare:workers";

type RuntimeEnv = Record<string, string | undefined>;

function runtimeEnv() {
  return env as unknown as RuntimeEnv;
}

export function turnstileSetup() {
  const runtime = runtimeEnv();
  const siteKey = runtime.TURNSTILE_SITE_KEY?.trim() || null;
  const secretKey = runtime.TURNSTILE_SECRET_KEY?.trim() || null;
  const required = true;
  return {
    siteKey,
    required,
    configured: Boolean(siteKey && secretKey),
    partial: Boolean(siteKey || secretKey) && !(siteKey && secretKey),
  };
}

export async function verifyTurnstileToken(token: string, remoteIp: string | null) {
  const secret = runtimeEnv().TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !token || token.length > 2_048) return false;

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
        idempotency_key: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(5_000),
    },
  ).catch(() => null);
  if (!response?.ok) return false;

  const result = await response.json().catch(() => null) as {
    success?: boolean;
    action?: string;
    hostname?: string;
  } | null;
  const allowedHostnames = new Set([
    "marinelahairdesign.com",
    "www.marinelahairdesign.com",
    "marine-la-hair-design.polite-drake-5642.chatgpt.site",
  ]);
  return Boolean(
    result?.success === true &&
    result.action === "booking" &&
    result.hostname &&
    allowedHostnames.has(result.hostname.toLowerCase()),
  );
}
