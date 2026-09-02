"use client";

import { useState } from "react";

export type ManagedUser = {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "staff";
  employeeId: "marinela" | "mia" | null;
  active: boolean;
};

function roleLabel(role: ManagedUser["role"]) {
  if (role === "owner") return "Vlasnik";
  if (role === "admin") return "Administrator";
  return "Zaposlenica";
}

export default function UsersManager({ users, currentUserId }: { users: ManagedUser[]; currentUserId: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [newRole, setNewRole] = useState<"staff" | "admin">("staff");

  async function addUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.get("displayName"),
          email: form.get("email"),
          role: form.get("role"),
          employeeId: form.get("employeeId"),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Korisnika nije moguće spremiti.");
      window.location.reload();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Korisnika nije moguće spremiti.");
      setSubmitting(false);
    }
  }

  async function removeUser(user: ManagedUser) {
    if (!window.confirm(`Ukloniti pristup za ${user.displayName}? Podaci ostaju sačuvani u evidenciji.`)) return;
    setError("");
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error || "Pristup nije moguće ukloniti.");
      return;
    }
    window.location.reload();
  }

  return (
    <div className="users-layout">
      <section className="admin-users-list">
        <div className="admin-section-title">
          <div><p>Pristup sustavu</p><h2>Aktivni korisnici</h2></div>
          <span>{users.filter((user) => user.active).length} aktivnih</span>
        </div>
        <div className="users-table-wrap">
          {users.map((user) => (
            <article className={!user.active ? "inactive" : undefined} key={user.id}>
              <span className="user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
              <div className="user-identity">
                <strong>{user.displayName}</strong>
                <small>{user.email}</small>
              </div>
              <div className="user-role"><span className={`role-pill ${user.role}`}>{roleLabel(user.role)}</span></div>
              <div className="user-scope">
                {user.employeeId === "marinela" ? "Marinela" : user.employeeId === "mia" ? "Mia" : "Svi podaci"}
              </div>
              <div className={`access-state ${user.active ? "active" : "inactive"}`}>
                {user.active ? "Aktivan" : "Uklonjen"}
              </div>
              {user.active && user.role !== "owner" && user.id !== currentUserId ? (
                <button type="button" onClick={() => removeUser(user)}>Ukloni</button>
              ) : <span />}
            </article>
          ))}
        </div>
      </section>

      <form className="admin-user-form" onSubmit={addUser}>
        <p>Marinela upravlja pristupom</p>
        <h2>Dodaj korisnika</h2>
        <label>Ime i prezime<input name="displayName" required /></label>
        <label>E-mail za prijavu<input name="email" type="email" required /></label>
        <label>
          Uloga
          <select name="role" value={newRole} onChange={(event) => setNewRole(event.target.value as "staff" | "admin")}>
            <option value="staff">Zaposlenica</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <label>
          Pristup terminima
          {newRole === "admin" ? (
            <select name="employeeId" value="" disabled aria-describedby="admin-scope-note">
              <option value="">Svi termini</option>
            </select>
          ) : (
            <select name="employeeId" defaultValue="mia">
              <option value="mia">Samo Mia</option>
              <option value="marinela">Samo Marinela</option>
            </select>
          )}
        </label>
        {newRole === "admin" && <small id="admin-scope-note">Administrator ima pristup svim terminima i upravljanju korisnicima.</small>}
        {error && <div className="booking-error" role="alert">{error}</div>}
        <button className="gold-button" type="submit" disabled={submitting}>
          {submitting ? "Spremanje…" : "Spremi korisnika"}
        </button>
        <small>Uklanjanje je sigurno: pristup se deaktivira, a evidencija ostaje sačuvana.</small>
      </form>
    </div>
  );
}
