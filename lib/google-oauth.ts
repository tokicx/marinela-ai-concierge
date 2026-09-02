import { env } from "cloudflare:workers";
import { randomBase64Url, sha256Base64Url } from "./oauth-crypto";
import { CANONICAL_SITE_ORIGIN } from "./site";

type RuntimeEnv = Record<string, string | undefined>;

function runtimeEnv() {
  return env as unknown as RuntimeEnv;
}

export function googleOAuthSetup() {
  const runtime = runtimeEnv();
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "OAUTH_TOKEN_ENCRYPTION_KEY",
    "SITE_ORIGIN",
  ] as const;
  const missing: string[] = required.filter((key) => !runtime[key]);
  if (
    runtime.OAUTH_TOKEN_ENCRYPTION_KEY &&
    new TextEncoder().encode(runtime.OAUTH_TOKEN_ENCRYPTION_KEY).byteLength < 32
  ) {
    missing.push("OAUTH_TOKEN_ENCRYPTION_KEY");
  }
  if (runtime.SITE_ORIGIN && runtime.SITE_ORIGIN !== CANONICAL_SITE_ORIGIN) {
    missing.push("SITE_ORIGIN");
  }
  return { configured: missing.length === 0, missing: [...new Set(missing)] };
}

function googleConfig() {
  const runtime = runtimeEnv();
  const setup = googleOAuthSetup();
  if (!setup.configured) return null;
  return {
    clientId: runtime.GOOGLE_CLIENT_ID!,
    clientSecret: runtime.GOOGLE_CLIENT_SECRET!,
    encryptionKey: runtime.OAUTH_TOKEN_ENCRYPTION_KEY!,
    redirectUri: new URL("/api/admin/google/callback", CANONICAL_SITE_ORIGIN).toString(),
  };
}

export function oauthEncryptionKey() {
  return googleConfig()?.encryptionKey ?? null;
}

export async function createGoogleOAuthRequest() {
  const config = googleConfig();
  if (!config) throw new Error("Google OAuth is not configured");
  const state = randomBase64Url(32);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.freebusy",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    ].join(" "),
  }).toString();
  return { url: url.toString(), state, codeVerifier };
}

export async function exchangeGoogleCode(code: string, codeVerifier: string) {
  const config = googleConfig();
  if (!config) throw new Error("Google OAuth is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Google OAuth exchange failed (${response.status})`);
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
  };
  if (!payload.access_token || !payload.refresh_token) {
    throw new Error("Google OAuth did not return reusable calendar access");
  }
  const grantedScopes = new Set((payload.scope ?? "").split(/\s+/).filter(Boolean));
  const requiredScopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.freebusy",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ];
  if (!requiredScopes.every((scope) => grantedScopes.has(scope))) {
    throw new Error("Google OAuth did not grant every required calendar permission");
  }
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token };
}

export async function readGoogleAccount(accessToken: string) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const [profileResponse, calendarsResponse] = await Promise.all([
    fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers,
      signal: AbortSignal.timeout(8_000),
    }),
    fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer", {
      headers,
      signal: AbortSignal.timeout(8_000),
    }),
  ]);
  if (!profileResponse.ok || !calendarsResponse.ok) {
    throw new Error("Google account or calendars could not be read");
  }
  const profile = (await profileResponse.json()) as { email?: string };
  const calendars = (await calendarsResponse.json()) as {
    items?: Array<{ id?: string; primary?: boolean; accessRole?: string }>;
  };
  const selected = calendars.items?.find((calendar) => calendar.primary)
    ?? calendars.items?.find((calendar) => calendar.accessRole === "owner")
    ?? calendars.items?.[0];
  if (!profile.email || !selected?.id) throw new Error("Google primary calendar is unavailable");
  return { accountEmail: profile.email.toLowerCase(), calendarId: selected.id };
}
