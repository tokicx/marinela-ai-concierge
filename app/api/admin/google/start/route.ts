import { env } from "cloudflare:workers";
import { canAccessEmployee, getCurrentSalonUser, hasValidSameOrigin } from "../../../../../lib/admin-auth";
import { createGoogleOAuthRequest, googleOAuthSetup } from "../../../../../lib/google-oauth";
import { sha256Base64Url } from "../../../../../lib/oauth-crypto";
import { consumeRateLimit } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentSalonUser();
  if (!user) return Response.json({ error: "Prijava je obavezna." }, { status: 401 });
  if (!hasValidSameOrigin(request)) {
    return Response.json({ error: "Neispravan izvor zahtjeva." }, { status: 403 });
  }
  const employeeId = new URL(request.url).searchParams.get("employeeId") ?? "";
  if (!["marinela", "mia"].includes(employeeId) || !canAccessEmployee(user, employeeId)) {
    return Response.json({ error: "Nemate ovlast za ovaj kalendar." }, { status: 403 });
  }
  if (!googleOAuthSetup().configured) {
    return Response.json({ error: "Google povezivanje još nije konfigurirano." }, { status: 503 });
  }
  const allowed = await consumeRateLimit({
    scope: "google_oauth_user",
    identifier: user.email,
    limit: 12,
    windowSeconds: 10 * 60,
    failureMode: "deny",
  });
  if (!allowed) {
    return Response.json(
      { error: "Previše pokušaja povezivanja. Pričekajte nekoliko minuta." },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  const oauth = await createGoogleOAuthRequest();
  const stateHash = await sha256Base64Url(oauth.state);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM calendar_oauth_states WHERE expires_at <= ?").bind(createdAt),
    env.DB.prepare(
      "INSERT INTO calendar_oauth_states (state_hash,employee_id,user_email,code_verifier,expires_at,created_at) VALUES (?,?,?,?,?,?)",
    ).bind(stateHash, employeeId, user.email, oauth.codeVerifier, expiresAt, createdAt),
  ]);
  return Response.redirect(oauth.url, 302);
}
