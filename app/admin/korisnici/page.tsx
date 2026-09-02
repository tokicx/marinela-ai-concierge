import { env } from "cloudflare:workers";
import { canManageUsers, requireSalonPageUser } from "../../../lib/admin-auth";
import AccessDenied from "../access-denied";
import AdminSidebar from "../admin-sidebar";
import UsersManager, { type ManagedUser } from "../users-manager";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: "owner" | "admin" | "staff";
  employee_id: "marinela" | "mia" | null;
  active: number;
};

async function loadUsers(): Promise<ManagedUser[]> {
  const result = await env.DB.prepare(
    "SELECT id,email,display_name,role,employee_id,active FROM salon_users ORDER BY active DESC, CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, display_name ASC",
  ).all<UserRow>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    employeeId: row.employee_id,
    active: Boolean(row.active),
  }));
}

export default async function UsersPage() {
  const user = await requireSalonPageUser("/admin/korisnici");
  if (!user || !canManageUsers(user)) return <AccessDenied />;
  const users = await loadUsers();

  return (
    <main className="admin-page">
      <AdminSidebar user={user} active="users" />
      <div className="admin-main">
        <header>
          <div><p>Administracija</p><h1>Korisnici i ovlasti.</h1></div>
        </header>
        <UsersManager users={users} currentUserId={user.id} />
      </div>
    </main>
  );
}
