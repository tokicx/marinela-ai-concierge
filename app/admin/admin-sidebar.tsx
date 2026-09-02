import Link from "next/link";
import { chatGPTSignOutPath } from "../chatgpt-auth";
import type { SalonUser } from "../../lib/admin-auth";

export default function AdminSidebar({
  user,
  active,
}: {
  user: SalonUser;
  active: "overview" | "services" | "prices" | "hours" | "users" | "calendars";
}) {
  const canManage = user.role === "owner" || user.role === "admin";

  return (
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/" aria-label="Marinela Hair Design — početna">
        <img
          src="/brand/marinela-signature-on-dark.svg"
          alt="Marinela Hair Design"
          width="564"
          height="340"
        />
      </Link>
      <nav>
        <div className="admin-nav-group">
          <p>Rad</p>
          <Link className={active === "overview" ? "active" : undefined} href="/admin"><span>01</span>Pregled</Link>
          <Link href="/admin#termini"><span>02</span>Termini</Link>
          <Link href="/admin#tim"><span>03</span>Zaposlenici</Link>
        </div>
        <div className="admin-nav-group">
          <p>Postavke</p>
          {canManage && (
            <Link className={active === "services" ? "active" : undefined} href="/admin/usluge"><span>04</span>Usluge i cijene</Link>
          )}
          {canManage && (
            <Link className={active === "prices" ? "active" : undefined} href="/admin/cjenik"><span>05</span>Javni cjenik</Link>
          )}
          {canManage && (
            <Link className={active === "hours" ? "active" : undefined} href="/admin/radno-vrijeme"><span>06</span>Radno vrijeme</Link>
          )}
          <Link className={active === "calendars" ? "active" : undefined} href="/admin/integracije"><span>07</span>Google kalendari</Link>
          {canManage && (
            <Link className={active === "users" ? "active" : undefined} href="/admin/korisnici"><span>08</span>Korisnici</Link>
          )}
        </div>
      </nav>
      <div className="admin-user">
        <span>{user.displayName.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{user.displayName}</strong>
          <small>{user.role === "staff" ? "Zaposlenica" : user.role === "admin" ? "Administrator" : "Vlasnik"}</small>
        </div>
      </div>
      <a className="admin-signout" href={chatGPTSignOutPath("/prijava")}>Odjava</a>
    </aside>
  );
}
