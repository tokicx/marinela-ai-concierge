import { canManageUsers, requireSalonPageUser } from "../../../lib/admin-auth";
import { loadOpeningHours } from "../../../lib/salon-settings";
import AccessDenied from "../access-denied";
import AdminSidebar from "../admin-sidebar";
import OpeningHoursManager from "../opening-hours-manager";

export const dynamic = "force-dynamic";

export default async function OpeningHoursPage() {
  const user = await requireSalonPageUser("/admin/radno-vrijeme");
  if (!user || !canManageUsers(user)) return <AccessDenied />;
  const hours = await loadOpeningHours();

  return (
    <main className="admin-page">
      <AdminSidebar user={user} active="hours" />
      <div className="admin-main">
        <header>
          <div><p>Postavke salona</p><h1>Radno vrijeme.</h1></div>
        </header>
        <OpeningHoursManager initialHours={hours} />
      </div>
    </main>
  );
}
