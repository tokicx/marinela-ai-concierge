import { canManageUsers, requireSalonPageUser } from "../../../lib/admin-auth";
import {
  finalizeGoogleCalendarCleanup,
  getGoogleCalendarConnectionStatus,
} from "../../../lib/google-calendar";
import { googleOAuthSetup } from "../../../lib/google-oauth";
import { team } from "../../salon-data";
import AccessDenied from "../access-denied";
import AdminSidebar from "../admin-sidebar";

export const dynamic = "force-dynamic";

type IntegrationsPageProps = {
  searchParams: Promise<{ status?: string; employeeId?: string; reason?: string }>;
};

export default async function IntegrationsPage({ searchParams }: IntegrationsPageProps) {
  const user = await requireSalonPageUser("/admin/integracije");
  if (!user) return <AccessDenied />;
  const allowedIds: Array<"marinela" | "mia"> = canManageUsers(user)
    ? ["marinela", "mia"]
    : user.employeeId
      ? [user.employeeId]
      : [];
  if (!allowedIds.length) return <AccessDenied />;

  const params = await searchParams;
  const setup = googleOAuthSetup();
  const cards = await Promise.all(
    allowedIds.map(async (employeeId) => {
      await finalizeGoogleCalendarCleanup(employeeId).catch(() => undefined);
      return {
        employee: team.find((member) => member.id === employeeId)!,
        status: await getGoogleCalendarConnectionStatus(employeeId),
      };
    }),
  );

  return (
    <main className="admin-page">
      <AdminSidebar user={user} active="calendars" />
      <div className="admin-main">
        <header>
          <div><p>Integracije</p><h1>Google kalendari.</h1></div>
        </header>

        {params.status === "connected" && (
          <div className="admin-feedback success">Kalendar je uspješno povezan i spreman za provjeru termina.</div>
        )}
        {params.status === "error" && params.reason === "account_assigned" && (
          <div className="admin-feedback error">Odabrani Google račun već je povezan s drugim zaposlenikom. Za svaki raspored odaberite zaseban Google račun.</div>
        )}
        {params.status === "error" && params.reason === "authorization_changed" && (
          <div className="admin-feedback error">Ovlast se promijenila tijekom povezivanja. Osvježite stranicu i pokušajte ponovno.</div>
        )}
        {params.status === "error" && params.reason === "restart" && (
          <div className="admin-feedback error">Prethodno povezivanje otvoreno je na staroj adresi i sigurno je prekinuto. Kliknite ponovno na povezivanje Google kalendara.</div>
        )}
        {params.status === "error" && !params.reason && (
          <div className="admin-feedback error">Povezivanje nije dovršeno. Pokušajte ponovno ili provjerite Google postavke.</div>
        )}
        {!setup.configured && (
          <div className="admin-security-note">
            Povezivanje je sigurno pripremljeno. Vlasnik aplikacije još treba jednokratno dodati Google Client ID i Client Secret; zaposlenice ih ne unose. Nakon toga klik na gumb otvara Google prijavu i automatski sprema odabrani račun, primarni kalendar i šifrirani pristup.
          </div>
        )}

        <section className="calendar-connections" aria-label="Google kalendari zaposlenika">
          {cards.map(({ employee, status }) => (
            <article key={employee.id} className={status.connected ? "connected" : undefined}>
              <div className="calendar-card-head">
                <span>{employee.initials}</span>
                <div>
                  <p>{employee.role}</p>
                  <h2>{employee.name}</h2>
                </div>
                <strong>{status.source === "invalid" ? "Ponovno povezivanje" : status.connected ? "Povezano" : "Nije povezano"}</strong>
              </div>
              <dl>
                <div><dt>Google račun</dt><dd>{status.accountEmail ?? "Nije odabran"}</dd></div>
                <div><dt>Kalendar</dt><dd>{status.source === "invalid" ? "Veza zahtijeva obnovu" : status.connected ? "Primarni kalendar" : "Čeka povezivanje"}</dd></div>
                <div><dt>Pristup</dt><dd>Dostupnost, upis i otkazivanje termina</dd></div>
                <div><dt>Potvrda klijentu</dt><dd>Google Calendar pozivnica na e-mail</dd></div>
              </dl>
              {setup.configured ? (
                <a className="calendar-connect-button" href={`/api/admin/google/start?employeeId=${employee.id}`}>
                  {status.connected ? "Ponovno poveži Google račun" : "Poveži Google kalendar"}
                </a>
              ) : (
                <span className="calendar-connect-button disabled" aria-disabled="true">Čeka Google postavke aplikacije</span>
              )}
              <small>
                {status.cleanupPending > 0
                  ? `Sigurno čišćenje ${status.cleanupPending} prethodne kalendarske veze dovršit će se nakon zadnjeg povezanog termina.`
                  : employee.id === "marinela"
                  ? "Marinela kao administrator može provjeriti oba statusa."
                  : "Mia nakon prijave upravlja isključivo svojim kalendarom."}
              </small>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
