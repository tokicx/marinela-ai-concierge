import { env } from "cloudflare:workers";
import { getChatGPTUser, requireChatGPTUser } from "../app/chatgpt-auth";

export type SalonRole = "owner" | "admin" | "staff";
export type SalonUser = {
  id: string;
  email: string;
  displayName: string;
  role: SalonRole;
  employeeId: "marinela" | "mia" | null;
};

type SalonUserRow = {
  id: string;
  email: string;
  display_name: string;
  role: SalonRole;
  employee_id: "marinela" | "mia" | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function findActiveSalonUser(email: string): Promise<SalonUser | null> {
  try {
    const row = await env.DB.prepare(
      "SELECT id,email,display_name,role,employee_id FROM salon_users WHERE email = ? AND active = 1 LIMIT 1",
    )
      .bind(normalizeEmail(email))
      .first<SalonUserRow>();
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      employeeId: row.employee_id,
    };
  } catch {
    return null;
  }
}

export async function requireSalonPageUser(returnTo: string) {
  const identity = await requireChatGPTUser(returnTo);
  return findActiveSalonUser(identity.email);
}

export async function getCurrentSalonUser() {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  return findActiveSalonUser(identity.email);
}

export function canManageUsers(user: SalonUser) {
  return user.role === "owner" || user.role === "admin";
}

export function canAccessEmployee(user: SalonUser, employeeId: string) {
  return canManageUsers(user) || user.employeeId === employeeId;
}

export function hasValidSameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin) return origin === new URL(request.url).origin;
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

type AdminAuditInput = {
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: string;
};

export function prepareAdminAudit(input: AdminAuditInput) {
  const createdAt = new Date().toISOString();
  return env.DB.prepare(
    "INSERT INTO admin_audit_log (id,actor_email,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      normalizeEmail(input.actorEmail),
      input.action,
      input.targetType,
      input.targetId,
      input.details ?? null,
      createdAt,
    );
}

export async function writeAdminAudit(input: AdminAuditInput) {
  await prepareAdminAudit(input).run();
}
