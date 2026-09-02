import { canManageUsers, requireSalonPageUser } from "../../../lib/admin-auth";
import { loadServices } from "../../../lib/salon-settings";
import AccessDenied from "../access-denied";
import AdminSidebar from "../admin-sidebar";
import ServicesManager from "../services-manager";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const user = await requireSalonPageUser("/admin/usluge");
  if (!user || !canManageUsers(user)) return <AccessDenied />;
  const services = await loadServices({ includeInactive: true });

  return (
    <main className="admin-page">
      <AdminSidebar user={user} active="services" />
      <div className="admin-main">
        <header>
          <div><p>Postavke salona</p><h1>Usluge i cijene.</h1></div>
        </header>
        <ServicesManager services={services} />
      </div>
    </main>
  );
}
