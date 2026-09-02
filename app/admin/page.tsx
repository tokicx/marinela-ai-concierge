import { env } from "cloudflare:workers";
import Link from "next/link";
import { canManageUsers, requireSalonPageUser, type SalonUser } from "../../lib/admin-auth";
import { bookingEmailConfigured } from "../../lib/email";
import {
  getGoogleCalendarConnectionStatus,
} from "../../lib/google-calendar";
import { googleOAuthSetup } from "../../lib/google-oauth";
import { loadServices } from "../../lib/salon-settings";
import AccessDenied from "./access-denied";
import AdminSidebar from "./admin-sidebar";
import BookingActions from "./booking-actions";

export const dynamic = "force-dynamic";

type BookingRow = {
  id: string;
  first_name: string;
  last_name: string;
  service_id: string;
  employee_id: "marinela" | "mia";
  date_local: string;
  start_time_local: string;
  status: string;
  email: string;
  phone: string;
  note: string | null;
};

async function loadBookings(user: SalonUser) {
  try {
    if (user.role === "staff" && !user.employeeId) return { activeRows: [], cancelledRows: [] };
    const now = new Date().toISOString();
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const fields = "id,first_name,last_name,service_id,employee_id,date_local,start_time_local,status,email,phone,note";
    const activeStatement = user.role === "staff"
      ? env.DB.prepare(
          `SELECT ${fields} FROM bookings WHERE deleted_at IS NULL AND status != 'cancelled' AND (operation_action IS NULL OR operation_action != 'create' OR operation_started_at IS NULL OR operation_started_at < ?) AND starts_at >= ? AND employee_id = ? ORDER BY starts_at ASC LIMIT 100`,
        ).bind(staleBefore, now, user.employeeId)
      : env.DB.prepare(
          `SELECT ${fields} FROM bookings WHERE deleted_at IS NULL AND status != 'cancelled' AND (operation_action IS NULL OR operation_action != 'create' OR operation_started_at IS NULL OR operation_started_at < ?) AND starts_at >= ? ORDER BY starts_at ASC LIMIT 100`,
        ).bind(staleBefore, now);
    const cancelledStatement = user.role === "staff"
      ? env.DB.prepare(
          `SELECT ${fields} FROM bookings WHERE deleted_at IS NULL AND status = 'cancelled' AND employee_id = ? ORDER BY updated_at DESC LIMIT 30`,
        ).bind(user.employeeId)
      : env.DB.prepare(
          `SELECT ${fields} FROM bookings WHERE deleted_at IS NULL AND status = 'cancelled' ORDER BY updated_at DESC LIMIT 30`,
        );
    const [activeResult, cancelledResult] = await Promise.all([
      activeStatement.all<BookingRow>(),
      cancelledStatement.all<BookingRow>(),
    ]);
    return {
      activeRows: activeResult.results ?? [],
      cancelledRows: cancelledResult.results ?? [],
    };
  } catch {
    return { activeRows: [], cancelledRows: [] };
  }
}

export default async function AdminPage() {
  const user = await requireSalonPageUser("/admin");
  if (!user) return <AccessDenied />;

  const accessibleEmployeeIds: Array<"marinela" | "mia"> = canManageUsers(user)
    ? ["marinela", "mia"]
    : user.employeeId
      ? [user.employeeId]
      : [];
  const [bookings, services, calendarStatuses] = await Promise.all([
    loadBookings(user),
    loadServices({ includeInactive: true }),
    Promise.all(accessibleEmployeeIds.map((employeeId) => getGoogleCalendarConnectionStatus(employeeId))),
  ]);
  const { activeRows, cancelledRows } = bookings;
  const confirmed = activeRows.filter((row) => row.status === "confirmed").length;
  const pending = activeRows.filter((row) =>
    row.status === "pending_confirmation" || row.status === "pending_calendar" || row.status === "needs_attention"
  ).length;
  const marinela = activeRows.filter((row) => row.employee_id === "marinela").length;
  const mia = activeRows.filter((row) => row.employee_id === "mia").length;
  const busiest = Math.max(marinela, mia, 1);
  const today = new Intl.DateTimeFormat("hr-HR", {
    day: "2-digit",
    month: "long",
    timeZone: "Europe/Zagreb",
    weekday: "long",
  }).format(new Date());
  const nextBooking = activeRows[0];
  const serviceNames = new Map(services.map((service) => [service.id, service.name]));
  const emailReady = bookingEmailConfigured();
  const calendarSetup = googleOAuthSetup();
  const calendarButtons = accessibleEmployeeIds.map((employeeId, index) => ({
    employeeId,
    name: employeeId === "marinela" ? "Marinela" : "Mia",
    initials: employeeId === "marinela" ? "MG" : "MJ",
    status: calendarStatuses[index],
  }));

  function statusLabel(status: string) {
    if (status === "confirmed") return "Potvrđeno";
    if (status === "pending_confirmation") return "Provjera sinkronizacije";
    if (status === "pending_calendar") return "Provjerite sinkronizaciju";
    if (status === "needs_attention") return "Zahtijeva provjeru";
    if (status === "cancelled") return "Otkazano";
    return status.replaceAll("_", " ");
  }

  return (
    <main className="admin-page">
      <AdminSidebar user={user} active="overview" />

      <div className="admin-main" id="pregled">
        <header className="admin-dashboard-header">
          <div>
            <p>Upravljačka ploča · {today}</p>
            <h1>Dobro došli, {user.displayName.split(" ")[0]}.</h1>
          </div>
          <div className="admin-header-actions">
            <Link href="/rezervacija">Nova rezervacija</Link>
            <a href="/" target="_blank" rel="noreferrer">Otvori stranicu ↗</a>
          </div>
        </header>

        {!emailReady && (
          <div className="admin-security-note">
            <strong>Brendirani e-mail pošiljatelj još nije povezan.</strong>{" "}
            Rezervacije se i dalje sigurno upisuju u Google kalendar, ali brendirane potvrde i podsjetnici čekaju ponovno povezivanje e-mail pošiljatelja.
          </div>
        )}

        <section className="admin-calendar-sync" aria-labelledby="calendar-sync-title">
          <div className="admin-calendar-sync-copy">
            <p>Google Calendar</p>
            <h2 id="calendar-sync-title">Sinkronizacija rasporeda.</h2>
            <span>
              {calendarSetup.configured
                ? "Odaberite raspored. Google prijava, dopuštenja i spremanje kalendara odradit će se automatski."
                : "Za prvi klik potrebna je jednokratna aktivacija Google aplikacije. Nakon toga zaposlenice ne unose tehničke podatke."}
            </span>
          </div>
          <div className="admin-calendar-sync-actions">
            {calendarButtons.map(({ employeeId, name, initials, status }) => (
              <article className={status.connected ? "connected" : undefined} key={employeeId}>
                <div>
                  <i aria-hidden="true">{initials}</i>
                  <span>
                    <strong>{name}</strong>
                    <small>
                      {status.source === "invalid"
                        ? "Vezu treba obnoviti"
                        : status.connected
                          ? status.accountEmail
                          : "Kalendar nije povezan"}
                    </small>
                  </span>
                </div>
                {calendarSetup.configured ? (
                  <a href={`/api/admin/google/start?employeeId=${employeeId}`}>
                    {status.connected ? "Ponovno poveži" : `Sinkroniziraj ${employeeId === "marinela" ? "Marinelin" : "Mijin"} kalendar`}
                  </a>
                ) : (
                  <span className="disabled" aria-disabled="true">Čeka aktivaciju</span>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="admin-command-card" aria-label="Status salona">
          <div className="admin-command-copy">
            <span className="admin-live-pill"><i /> Salon online</span>
            <p>Salon concierge</p>
            <h2>Termini, tim i kalendari.<br />Sve na jednom mjestu.</h2>
          </div>
          <dl className="admin-command-meta">
            <div>
              <dt>Sljedeći termin</dt>
              <dd>{nextBooking ? `${nextBooking.date_local.split("-").reverse().join(".")} · ${nextBooking.start_time_local}` : "Nema termina"}</dd>
            </div>
            <div>
              <dt>Za provjeru</dt>
              <dd>{pending ? `${pending} ${pending === 1 ? "zahtjev" : "zahtjeva"}` : "Sve riješeno"}</dd>
            </div>
            <div>
              <dt>Vremenska zona</dt>
              <dd>Europe / Zagreb</dd>
            </div>
          </dl>
        </section>

        <section className="admin-stats">
          <article className="admin-stat-card confirmed-card">
            <div><span>Potvrđeno</span><i className="admin-stat-icon" aria-hidden="true">✓</i></div>
            <strong>{confirmed}</strong><small>aktivnih termina</small>
          </article>
          <article className="admin-stat-card pending-card">
            <div><span>Za provjeru</span><i className="admin-stat-icon" aria-hidden="true">!</i></div>
            <strong>{pending}</strong><small>samo iznimke sinkronizacije</small>
          </article>
          {user.role === "staff" ? (
            <>
              <article className="admin-stat-card"><div><span>Moji termini</span><i className="admin-stat-icon initials" aria-hidden="true">MJ</i></div><strong>{activeRows.length}</strong><small>ukupno aktivnih</small></article>
              <article className="admin-stat-card"><div><span>Kalendar</span><i className="admin-stat-icon" aria-hidden="true">↗</i></div><strong>1</strong><small>osobna integracija</small></article>
            </>
          ) : (
            <>
              <article className="admin-stat-card"><div><span>Marinela</span><i className="admin-stat-icon initials" aria-hidden="true">MG</i></div><strong>{marinela}</strong><small>rezervacija</small></article>
              <article className="admin-stat-card"><div><span>Mia</span><i className="admin-stat-icon initials" aria-hidden="true">MJ</i></div><strong>{mia}</strong><small>rezervacija</small></article>
            </>
          )}
        </section>

        <div className="admin-dashboard-grid">
          <section className="admin-bookings" id="termini">
            <div className="admin-section-title">
              <div><p>Raspored</p><h2>Nadolazeći termini</h2></div>
              <span>{activeRows.length} ukupno</span>
            </div>
            {activeRows.length ? (
              <div className="admin-table-wrap" role="region" aria-label="Nadolazeći termini" tabIndex={0}>
                <table>
                  <caption className="visually-hidden">Nadolazeći termini salona</caption>
                  <thead><tr><th scope="col">Klijent</th><th scope="col">Usluga</th><th scope="col">Stručnjak</th><th scope="col">Termin</th><th scope="col">Status</th><th scope="col">Kontakt</th><th scope="col">Radnje</th></tr></thead>
                  <tbody>
                    {activeRows.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Klijent"><strong>{row.first_name} {row.last_name}</strong><small>#{row.id.slice(0,8)}</small>{row.note && <small className="admin-booking-note">Napomena: {row.note}</small>}</td>
                        <td data-label="Usluga">{serviceNames.get(row.service_id) ?? row.service_id.replaceAll("-", " ")}</td>
                        <td data-label="Stručnjak"><span className="admin-employee"><i>{row.employee_id === "marinela" ? "MG" : "MJ"}</i>{row.employee_id === "marinela" ? "Marinela" : "Mia"}</span></td>
                        <td data-label="Termin"><strong>{row.date_local.split("-").reverse().join(".")}</strong><small>{row.start_time_local}</small></td>
                        <td data-label="Status"><span className={`status-pill ${row.status}`}>{statusLabel(row.status)}</span></td>
                        <td data-label="Kontakt"><a href={`tel:${row.phone}`}>{row.phone}</a><a className="admin-email" href={`mailto:${row.email}`}>{row.email}</a></td>
                        <td data-label="Radnje"><BookingActions bookingId={row.id} status={row.status} canDelete={canManageUsers(user)} currentDate={row.date_local} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty">
                <span>✦</span><h3>Nema zaprimljenih rezervacija.</h3>
                <p>Novi online termini pojavit će se ovdje čim ih klijent pošalje.</p>
              </div>
            )}
          </section>

          <aside className="admin-insight-rail" aria-label="Brzi pregled">
            <section className="admin-team-load">
              <div className="admin-section-title"><div><p>Tim</p><h2>Opterećenje</h2></div><span>{activeRows.length} termina</span></div>
              <div className="admin-load-row">
                <div><i>MG</i><span><strong>Marinela</strong><small>{marinela} rezervacija</small></span></div>
                <b><span style={{ width: `${Math.round((marinela / busiest) * 100)}%` }} /></b>
              </div>
              <div className="admin-load-row">
                <div><i>MJ</i><span><strong>Mia</strong><small>{mia} rezervacija</small></span></div>
                <b><span style={{ width: `${Math.round((mia / busiest) * 100)}%` }} /></b>
              </div>
            </section>
            <Link className="admin-calendar-spotlight" href="/admin/integracije">
              <span>Google Calendar</span>
              <strong>{user.role === "staff" ? "Moj osobni raspored" : "2 odvojena rasporeda"}</strong>
              <small>{user.role === "staff" ? "Provjeri povezanost svojeg kalendara" : "Provjeri povezanost Marinele i Mije"}</small>
              <i aria-hidden="true">↗</i>
            </Link>
          </aside>
        </div>

        {cancelledRows.length > 0 && (
          <section className="admin-bookings cancelled-bookings" aria-label="Otkazani termini">
            <div className="admin-section-title">
              <div><p>Evidencija</p><h2>Otkazani termini</h2></div>
              <span>{cancelledRows.length} za pregled</span>
            </div>
            <div className="admin-table-wrap" role="region" aria-label="Otkazani termini" tabIndex={0}>
              <table>
                <caption className="visually-hidden">Otkazani termini salona</caption>
                <thead><tr><th scope="col">Klijent</th><th scope="col">Usluga</th><th scope="col">Stručnjak</th><th scope="col">Termin</th><th scope="col">Status</th><th scope="col">Kontakt</th><th scope="col">Radnje</th></tr></thead>
                <tbody>
                  {cancelledRows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Klijent"><strong>{row.first_name} {row.last_name}</strong><small>#{row.id.slice(0,8)}</small>{row.note && <small className="admin-booking-note">Napomena: {row.note}</small>}</td>
                      <td data-label="Usluga">{serviceNames.get(row.service_id) ?? row.service_id.replaceAll("-", " ")}</td>
                      <td data-label="Stručnjak"><span className="admin-employee"><i>{row.employee_id === "marinela" ? "MG" : "MJ"}</i>{row.employee_id === "marinela" ? "Marinela" : "Mia"}</span></td>
                      <td data-label="Termin"><strong>{row.date_local.split("-").reverse().join(".")}</strong><small>{row.start_time_local}</small></td>
                      <td data-label="Status"><span className="status-pill cancelled">Otkazano</span></td>
                      <td data-label="Kontakt"><a href={`tel:${row.phone}`}>{row.phone}</a><a className="admin-email" href={`mailto:${row.email}`}>{row.email}</a></td>
                      <td data-label="Radnje"><BookingActions bookingId={row.id} status={row.status} canDelete={canManageUsers(user)} currentDate={row.date_local} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="admin-config-section">
          <div className="admin-section-title"><div><p>Postavke salona</p><h2>Upravljanje</h2></div><span>Sigurni pristup prema ulozi</span></div>
          <div className="admin-config-grid">
            <article id="tim"><p>01 · Tim</p><h2>2 zaposlenika</h2><span>Marinela Grančić · Mia Jakelić</span></article>
            {canManageUsers(user) && (
              <Link className="admin-config-card" href="/admin/usluge"><p>02 · Katalog</p><h2>{services.filter((service) => service.active).length} usluga</h2><span>Dodavanje, cijene, trajanja i zaposlenici</span></Link>
            )}
            {canManageUsers(user) && (
              <Link className="admin-config-card" href="/admin/cjenik"><p>03 · Cjenik</p><h2>Javne cijene</h2><span>Uredite detaljni cjenik prikazan na webu</span></Link>
            )}
            {canManageUsers(user) && (
              <Link className="admin-config-card" href="/admin/radno-vrijeme"><p>04 · Raspored</p><h2>Radno vrijeme</h2><span>Uredite svaki dan izravno iz dashboarda</span></Link>
            )}
            <Link className="admin-config-card" href="/admin/integracije"><p>{canManageUsers(user) ? "05" : "02"} · Kalendar</p><h2>{user.role === "staff" ? "Moj kalendar" : "2 kalendara"}</h2><span>Povezivanje i status računa</span></Link>
            {(user.role === "owner" || user.role === "admin") && (
              <Link className="admin-config-card" href="/admin/korisnici"><p>06 · Pristup</p><h2>Korisnici</h2><span>Dodavanje i uklanjanje pristupa</span></Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
