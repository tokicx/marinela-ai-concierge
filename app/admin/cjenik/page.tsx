import { canManageUsers, requireSalonPageUser } from "../../../lib/admin-auth";
import { loadPriceList } from "../../../lib/price-list";
import AccessDenied from "../access-denied";
import AdminSidebar from "../admin-sidebar";
import PriceListManager from "../price-list-manager";

export const dynamic = "force-dynamic";

export default async function AdminPriceListPage() {
  const user = await requireSalonPageUser("/admin/cjenik");
  if (!user || !canManageUsers(user)) return <AccessDenied />;
  const sections = await loadPriceList({ includeInactive: true });

  return (
    <main className="admin-page">
      <AdminSidebar user={user} active="prices" />
      <div className="admin-main">
        <header>
          <div><p>Postavke salona</p><h1>Javni cjenik.</h1></div>
          <div className="admin-header-actions">
            <a href="/admin/cjenik/ispis" target="_blank" rel="noreferrer">Izvezi cjenik A4 ↗</a>
            <a href="/cjenik" target="_blank" rel="noreferrer">Otvori cjenik ↗</a>
          </div>
        </header>
        <PriceListManager sections={sections} />
      </div>
    </main>
  );
}
