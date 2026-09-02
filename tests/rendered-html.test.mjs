import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("offers Marinela and Mia for every published service", async () => {
  const salonData = await readFile(new URL("../app/salon-data.ts", import.meta.url), "utf8");
  const assignments = [...salonData.matchAll(/staffIds:\s*\[([^\]]+)\]/g)].map((match) => match[1]);

  assert.equal(assignments.length, 11);
  for (const assignment of assignments) {
    assert.match(assignment, /"marinela"/);
    assert.match(assignment, /"mia"/);
  }
});

test("keeps booking on its own route", async () => {
  const homePage = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const bookingPage = await readFile(new URL("../app/rezervacija/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(homePage, /BookingExperience/);
  assert.doesNotMatch(homePage, /#rezervacija/);
  assert.match(homePage, /href="\/rezervacija"/);
  assert.match(homePage, /className="hero-secondary-links"[\s\S]*href="#rezultati">Pogledaj rezultate<\/a>[\s\S]*href="\/cjenik">Pogledaj cjenik<\/Link>/);
  assert.match(css, /\.lux-hero-actions \{[\s\S]*max-width: 100%;[\s\S]*min-width: 0;/);
  assert.match(css, /\.hero-secondary-links \{[\s\S]*flex-direction: column;[\s\S]*max-width: 100%;[\s\S]*min-width: 0;/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.lux-hero-actions \{ align-items: flex-start; flex-direction: column;/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.hero-secondary-links \.ghost-link \{ align-items: center; min-height: 44px; \}/);
  assert.match(bookingPage, /<BookingExperience[\s\S]*initialServiceId=\{initialServiceId\}[\s\S]*services=\{services\}[\s\S]*openingHours=\{openingHours\}/);
  assert.match(bookingPage, /<SiteHeader bookingActive \/>/);
});

test("deep-links every service into a preselected booking", async () => {
  const salonData = await readFile(new URL("../app/salon-data.ts", import.meta.url), "utf8");
  const homePage = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const bookingPage = await readFile(new URL("../app/rezervacija/page.tsx", import.meta.url), "utf8");
  const bookingExperience = await readFile(
    new URL("../app/booking-experience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(salonData, /rezervacija\?usluga=\$\{encodeURIComponent\(serviceId\)\}/);
  assert.match(homePage, /bookingHref\(service\.id\)/);
  assert.match(homePage, /bookingHref\(story\.serviceId\)/);
  assert.match(homePage, /bookingHref\("bojanje-kose"\)|service\.id/);
  assert.match(bookingPage, /services\.find\(\(service\) => service\.id === requestedService\)/);
  assert.match(bookingExperience, /aria-pressed=\{serviceId === service\.id\}/);
});

test("keeps the results gallery full-width without implicit empty grid rows", async () => {
  const homePage = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(homePage, /className="result-detail-pair"[\s\S]*className="result-balayage"[\s\S]*className="result-detail"/);
  assert.match(css, /\.results-grid \{[\s\S]*grid-template-columns: minmax\(0,5fr\) minmax\(0,7fr\)/);
  assert.match(css, /\.result-detail-pair \{[\s\S]*grid-column: 2;[\s\S]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.results-grid \.result-wide \{ grid-column: 2; grid-row: 2; \}/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.result-detail-pair \{ display: contents; \}/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.results-grid \{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(0,1fr\)/);
  assert.match(css, /\.results-grid \.result-wide \{ aspect-ratio: 950 \/ 655; \}/);
  assert.doesNotMatch(css.match(/\.results-grid \{[\s\S]*?\n\}/)?.[0] ?? "", /repeat\(12/);
});

test("rejects impossible dates and enforces the salon booking window", async () => {
  const { bookingWindowEndDate, isDateWithinBookingWindow, isIsoDate, salonDateString } = await import("../lib/time.ts");
  const now = new Date("2026-08-25T10:00:00.000Z");

  assert.equal(isIsoDate("2026-02-31"), false);
  assert.equal(isIsoDate("2028-02-29"), true);
  assert.equal(isDateWithinBookingWindow("2026-08-24", now), false);
  assert.equal(isDateWithinBookingWindow(salonDateString(now), now), true);
  assert.equal(isDateWithinBookingWindow("2026-10-01", now), false);
  const springDst = new Date("2026-03-28T22:30:00.000Z");
  assert.equal(bookingWindowEndDate(springDst), "2026-04-27");
  assert.equal(isDateWithinBookingWindow("2026-04-27", springDst), true);
  assert.equal(isDateWithinBookingWindow("2026-04-28", springDst), false);
  const autumnDst = new Date("2026-10-24T22:30:00.000Z");
  assert.equal(bookingWindowEndDate(autumnDst), "2026-11-24");
  assert.equal(isDateWithinBookingWindow("2026-11-24", autumnDst), true);
});

test("checks every displayed date and distinguishes full days from failed checks", async () => {
  const bookingExperience = await readFile(
    new URL("../app/booking-experience.tsx", import.meta.url),
    "utf8",
  );
  const availabilityApi = await readFile(
    new URL("../app/api/availability/route.ts", import.meta.url),
    "utf8",
  );
  const availability = await readFile(new URL("../lib/availability.ts", import.meta.url), "utf8");
  const bookingApi = await readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");

  assert.match(bookingExperience, /dates: dates\.map\(\(item\) => item\.iso\)\.join\(","\)/);
  assert.match(bookingExperience, /DateCheckState = "checking" \| "available" \| "full" \| "error"/);
  assert.match(bookingExperience, /availability\?\.checked === false[\s\S]*"error"/);
  assert.match(bookingExperience, /disabled=\{status !== "available"\}/);
  assert.match(bookingExperience, /Popunjeno/);
  assert.match(bookingExperience, /Provjeri ponovno/);
  assert.match(bookingExperience, /dateCheckSequence\.current/);
  assert.match(bookingExperience, /controller\.abort\(\)/);

  assert.match(availabilityApi, /requestedDates\.length > 15/);
  assert.match(availabilityApi, /availableTimesForDates\(service, normalizedStaffId, requestedDates\)/);
  assert.match(availabilityApi, /"Cache-Control": "no-store"/);
  assert.match(availability, /readGoogleBusy\(employeeId, rangeStart, rangeEnd\)/);
  assert.match(availability, /localBusy\(employeeId, rangeStart, rangeEnd, options\)/);
  assert.match(availability, /readGoogleBusyExcludingEvent/);
  assert.match(availability, /excludeGoogleEvent\.eventId/);
  assert.match(availability, /checked: merged\.length > 0 \|\| perEmployee\.every\(\(entry\) => entry\.checked\)/);
  assert.match(bookingApi, /availableTimes\([\s\S]*date/);
});

test("keeps mobile booking actions inside the viewport and makes booking links single-tap native", async () => {
  const homePage = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const priceList = await readFile(new URL("../app/cjenik/page.tsx", import.meta.url), "utf8");
  const bookingExperience = await readFile(
    new URL("../app/booking-experience.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(homePage, /<a className="champagne-button" href="\/rezervacija">/);
  assert.match(homePage, /<a className="mobile-booking-bar" href="\/rezervacija"/);
  assert.match(priceList, /<a className="mobile-booking-bar" href="\/rezervacija"/);
  assert.match(bookingExperience, /bookingPanel\.current\?\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(bookingExperience, /aria-pressed=\{date === item\.iso\}/);
  assert.match(css, /\.booking-panel \{[\s\S]*min-width: 0;[\s\S]*scroll-margin-top: 112px/);
  assert.match(css, /\.booking-step \{ min-width: 0;[\s\S]*width: 100%; \}/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.booking-shell \{ grid-template-columns: minmax\(0,1fr\); \}/);
  assert.match(css, /\.date-choice-grid \{[\s\S]*max-width: 100%;[\s\S]*min-width: 0;[\s\S]*overflow-x: auto;[\s\S]*width: 100%;/);
  assert.match(css, /\.booking-actions \{[\s\S]*min-width: 0;[\s\S]*width: 100%;/);
  assert.match(css, /\.mobile-booking-bar \{[\s\S]*safe-area-inset-bottom[\s\S]*touch-action: manipulation/);
});

test("uses the approved ornate transparent logo without pasted background panels", async () => {
  const header = await readFile(new URL("../app/site-header.tsx", import.meta.url), "utf8");
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const bookingExperience = await readFile(
    new URL("../app/booking-experience.tsx", import.meta.url),
    "utf8",
  );
  const login = await readFile(new URL("../app/prijava/page.tsx", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("../app/admin/admin-sidebar.tsx", import.meta.url), "utf8");
  const denied = await readFile(new URL("../app/admin/access-denied.tsx", import.meta.url), "utf8");

  assert.match(header, /marinela-signature-on-dark\.svg/);
  assert.match(home, /marinela-crest-on-dark\.svg/);
  assert.match(bookingExperience, /marinela-signature-on-light\.svg/);
  for (const source of [login, sidebar, denied]) {
    assert.match(source, /marinela-signature-on-dark\.svg/);
  }
  for (const source of [header, home, bookingExperience, login, sidebar, denied]) {
    assert.doesNotMatch(source, /marinela-signature-logo-light\.png/);
    assert.doesNotMatch(source, /marinela-signature-logo\.png/);
    assert.doesNotMatch(source, /marinela-(?:logo|monogram)-/);
  }

  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.booking-success \{[\s\S]*#fbf8f2[\s\S]*#f4eee5/);
  assert.doesNotMatch(css.match(/\.booking-success \{[\s\S]*?\n\}/)?.[0] ?? "", /#090909|#050505/);
  assert.match(css, /booking-success::after[\s\S]*marinela-crest-on-light\.svg/);

  const darkLogo = await readFile(
    new URL("../public/brand/marinela-signature-on-dark.svg", import.meta.url),
    "utf8",
  );
  const lightLogo = await readFile(
    new URL("../public/brand/marinela-signature-on-light.svg", import.meta.url),
    "utf8",
  );
  for (const logo of [darkLogo, lightLogo]) {
    assert.match(logo, /viewBox="88 20 282 170"/);
    assert.match(logo, /linearGradient/);
    assert.match(logo, /woman profile and flowing hair/);
    assert.doesNotMatch(logo, /<rect/);
  }
});

test("exports the live dashboard price list as an authenticated premium A4 document", async () => {
  const dashboard = await readFile(
    new URL("../app/admin/cjenik/page.tsx", import.meta.url),
    "utf8",
  );
  const printable = await readFile(
    new URL("../app/admin/cjenik/ispis/page.tsx", import.meta.url),
    "utf8",
  );
  const toolbar = await readFile(
    new URL("../app/admin/cjenik/ispis/print-toolbar.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(dashboard, /href="\/admin\/cjenik\/ispis"[\s\S]*Izvezi cjenik A4/);
  assert.match(printable, /requireSalonPageUser\("\/admin\/cjenik\/ispis"\)/);
  assert.match(printable, /canManageUsers\(user\)/);
  assert.match(printable, /await loadPriceList\(\)/);
  assert.match(printable, /marinela-signature-on-light\.svg/);
  assert.match(printable, /Sredstvo plaćanja/);
  assert.match(printable, /Gotovina/);
  assert.match(printable, /Cjeloviti cjenik usluga — jedna A4 stranica/);
  assert.match(printable, /Sredstvo plaćanja: <strong>Gotovina<\/strong>/);
  assert.match(printable, /splitRows/);
  assert.match(printable, /splitTables/);
  assert.match(printable, />1 \/ 1</);
  assert.match(toolbar, /window\.print\(\)/);
  assert.match(toolbar, /Spremi kao PDF|spremi PDF/);
  assert.match(toolbar, /Cijeli cjenik stane na jedan A4 list/);
  assert.match(css, /@page price-list \{ size: A4 landscape; margin: 0; \}/);
  assert.match(css, /\.price-print-sheet \{[\s\S]*page: price-list/);
  assert.match(css, /\.price-print-sheet \{[\s\S]*height: 210mm;[\s\S]*width: 297mm/);
  assert.match(css, /\.price-print-mid-grid \{[\s\S]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.price-print-section\.split-rows > \.price-print-tables \{[\s\S]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.price-print-section\.split-tables > \.price-print-tables \{[\s\S]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(printable, /price-print-single-column-table/);
  assert.match(css, /\.price-print-single-column-table tbody \{[\s\S]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.price-print-sheet\.is-dense[\s\S]*padding-block: \.24mm/);
  assert.match(css, /\.price-print-sheet\.is-ultra-dense[\s\S]*padding-block: \.16mm/);
  assert.match(css, /\.price-print-sheet \{[\s\S]*print-color-adjust: exact/);
  assert.match(css, /@media print \{[\s\S]*\.price-print-toolbar \{ display: none/);
  assert.match(toolbar, /document\.fonts\?\.ready/);
  assert.match(toolbar, /sheet\.scrollHeight <= sheet\.clientHeight \+ 1/);
  assert.match(toolbar, /getComputedStyle\(child as HTMLElement\)\.display !== "none"/);
  assert.match(toolbar, /new ResizeObserver/);
  assert.match(printable, /data-print-fit="checking"/);
  assert.match(css, /\.price-print-sheet:not\(\[data-print-fit="fits"\]\)/);
});

test("seeds secure owner, Marinela admin, and migrates Mia to her current login", async () => {
  const migration = await readFile(
    new URL("../drizzle/0001_chief_kid_colt.sql", import.meta.url),
    "utf8",
  );
  const miaEmailMigration = await readFile(
    new URL("../drizzle/0014_update_mia_email.sql", import.meta.url),
    "utf8",
  );
  const adminAuth = await readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8");

  assert.match(migration, /owner@example\.com','Ivan Tokić','owner'/);
  assert.match(migration, /salon@example\.com','Marinela Grančić','admin','marinela'/);
  assert.match(migration, /former\.staff@example\.com','Mia Jakelić','staff','mia'/);
  assert.match(miaEmailMigration, /SET[\s\S]*`email` = 'staff@example\.com'/);
  assert.match(miaEmailMigration, /WHERE `employee_id` = 'mia'[\s\S]*= 1/);
  assert.match(miaEmailMigration, /DELETE FROM `calendar_oauth_states`[\s\S]*`employee_id` = 'mia'/);
  assert.match(miaEmailMigration, /CHECK \(`ok` = 1\)/);
  assert.match(adminAuth, /WHERE email = \? AND active = 1/);
  assert.match(adminAuth, /Sec-Fetch-Site/);
  assert.doesNotMatch(adminAuth, /allowlist\.length === 0/);
});

test("changes only Mias login email and fails closed on an identity conflict", async () => {
  const migration = await readFile(
    new URL("../drizzle/0014_update_mia_email.sql", import.meta.url),
    "utf8",
  );
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  function databaseWithMia({ conflictingEmail = false } = {}) {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE salon_users (
        id text PRIMARY KEY,
        email text NOT NULL UNIQUE,
        display_name text NOT NULL,
        role text NOT NULL,
        employee_id text,
        active integer NOT NULL,
        created_by_email text NOT NULL,
        created_at text NOT NULL,
        updated_at text NOT NULL,
        removed_at text
      );
      CREATE TABLE calendar_oauth_states (
        state_hash text PRIMARY KEY,
        employee_id text NOT NULL,
        user_email text NOT NULL
      );
      CREATE TABLE admin_audit_log (
        id text PRIMARY KEY,
        actor_email text NOT NULL,
        action text NOT NULL,
        target_type text NOT NULL,
        target_id text NOT NULL,
        details text,
        created_at text NOT NULL
      );
      CREATE TABLE google_calendar_connections (
        employee_id text PRIMARY KEY,
        connection_id text NOT NULL,
        calendar_id text NOT NULL,
        google_account_email text NOT NULL,
        refresh_token_encrypted text NOT NULL,
        connected_by_email text NOT NULL
      );
      INSERT INTO salon_users VALUES (
        'salon-staff-mia','former.staff@example.com','Mia Jakelić','staff','mia',1,
        'salon@example.com','2026-08-25T00:00:00.000Z','2026-08-25T00:00:00.000Z',NULL
      );
      INSERT INTO calendar_oauth_states VALUES ('old-state','mia','former.staff@example.com');
      INSERT INTO google_calendar_connections VALUES (
        'mia','connection-kept','primary','calendar@example.com','encrypted-token-kept','owner@example.com'
      );
    `);
    if (conflictingEmail) {
      database.exec(`
        INSERT INTO salon_users VALUES (
          'other-user','staff@example.com','Drugi korisnik','staff',NULL,1,
          'system','2026-08-31T00:00:00.000Z','2026-08-31T00:00:00.000Z',NULL
        );
      `);
    }
    return database;
  }

  const database = databaseWithMia();
  for (const statement of statements) database.exec(statement);
  const migrated = database.prepare(
    "SELECT id,email,role,employee_id,active,updated_at FROM salon_users WHERE id = 'salon-staff-mia'",
  ).get();
  assert.equal(migrated.email, "staff@example.com");
  assert.equal(migrated.id, "salon-staff-mia");
  assert.equal(migrated.role, "staff");
  assert.equal(migrated.employee_id, "mia");
  assert.equal(migrated.active, 1);
  assert.equal(database.prepare("SELECT count(*) AS total FROM calendar_oauth_states").get().total, 0);
  assert.deepEqual(
    { ...database.prepare("SELECT * FROM google_calendar_connections WHERE employee_id = 'mia'").get() },
    {
      employee_id: "mia",
      connection_id: "connection-kept",
      calendar_id: "primary",
      google_account_email: "calendar@example.com",
      refresh_token_encrypted: "encrypted-token-kept",
      connected_by_email: "owner@example.com",
    },
  );
  assert.deepEqual(
    { ...database.prepare("SELECT actor_email,action,target_type,target_id,details FROM admin_audit_log").get() },
    {
      actor_email: "system",
      action: "user_email_changed",
      target_type: "salon_user",
      target_id: "salon-staff-mia",
      details: '{"email":"staff@example.com"}',
    },
  );
  const updatedAt = migrated.updated_at;
  for (const statement of statements) database.exec(statement);
  assert.equal(
    database.prepare("SELECT updated_at FROM salon_users WHERE id = 'salon-staff-mia'").get().updated_at,
    updatedAt,
  );
  assert.equal(database.prepare("SELECT count(*) AS total FROM admin_audit_log").get().total, 1);
  database.close();

  const conflict = databaseWithMia({ conflictingEmail: true });
  assert.throws(() => {
    for (const statement of statements) conflict.exec(statement);
  }, /CHECK constraint failed/);
  assert.equal(
    conflict.prepare("SELECT email FROM salon_users WHERE id = 'salon-staff-mia'").get().email,
    "former.staff@example.com",
  );
  conflict.close();
});

test("enforces role-scoped admin data and recoverable user removal", async () => {
  const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const usersApi = await readFile(
    new URL("../app/api/admin/users/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const usersCollectionApi = await readFile(
    new URL("../app/api/admin/users/route.ts", import.meta.url),
    "utf8",
  );
  const userUniquenessMigration = await readFile(
    new URL("../drizzle/0011_military_stellaris.sql", import.meta.url),
    "utf8",
  );

  assert.match(adminPage, /AND employee_id = \?/);
  assert.match(adminPage, /user\.role === "staff"/);
  assert.match(usersApi, /Ne možete ukloniti vlastiti račun/);
  assert.match(usersApi, /Vlasnički račun nije moguće ukloniti/);
  assert.match(usersApi, /SET active = 0, employee_id = NULL, removed_at = \?/);
  assert.match(usersApi, /INSERT OR IGNORE INTO google_calendar_cleanup_connections/);
  assert.match(usersApi, /DELETE FROM google_calendar_connections/);
  assert.match(usersApi, /cleanup\.refresh_token_encrypted = google_calendar_connections\.refresh_token_encrypted/);
  assert.doesNotMatch(usersApi, /futureCalendarBookingDependencies|FROM bookings/);
  assert.match(usersApi, /DELETE FROM calendar_oauth_states\s+WHERE lower\(user_email\)/);
  assert.match(usersApi, /const mutationSucceeded =[\s\S]*active = 0/);
  assert.match(usersApi, /SELECT id,email,role,employee_id,active,updated_at/);
  assert.match(usersApi, /role = \? AND employee_id IS \?[\s\S]*lower\(email\) = \? AND updated_at = \?/);
  assert.match(usersApi, /SELECT 1 FROM salon_users actor[\s\S]*actor\.active = 1[\s\S]*actor\.role IN \('owner','admin'\)/);
  assert.match(usersApi, /results\[0\]\?\.meta\.changes/);
  assert.match(usersApi, /results\[2\]\?\.meta\.changes/);
  assert.match(usersCollectionApi, /INSERT OR IGNORE INTO google_calendar_cleanup_connections/);
  assert.match(usersCollectionApi, /'user_reassigned'/);
  assert.doesNotMatch(usersCollectionApi, /futureCalendarBookingDependencies|FROM bookings/);
  assert.match(usersCollectionApi, /const mutationSucceeded =[\s\S]*employee_id IS \?/);
  assert.match(usersCollectionApi, /SELECT id,role,employee_id,active,updated_at/);
  assert.match(usersCollectionApi, /WHERE id = \? AND active = \? AND role = \? AND employee_id IS \? AND updated_at = \?/);
  assert.match(usersCollectionApi, /SELECT 1 FROM salon_users actor[\s\S]*actor\.active = 1[\s\S]*actor\.role IN \('owner','admin'\)/);
  assert.match(usersCollectionApi, /INSERT INTO salon_users[\s\S]*WHERE EXISTS \([\s\S]*salon_users actor/);
  assert.match(usersCollectionApi, /results\[0\]\?\.meta\.changes/);
  assert.match(usersCollectionApi, /results\[1\]\?\.meta\.changes/);
  assert.match(userUniquenessMigration, /SET `employee_id` = NULL WHERE `active` = 0/);
  assert.match(userUniquenessMigration, /ranked_assignments/);
  assert.match(userUniquenessMigration, /SET `active` = 0/);
  assert.match(userUniquenessMigration, /CREATE UNIQUE INDEX `salon_users_employee_unique`/);
});

test("protects per-employee Google Calendar OAuth with PKCE and one-time state", async () => {
  const oauth = await readFile(new URL("../lib/google-oauth.ts", import.meta.url), "utf8");
  const callback = await readFile(
    new URL("../app/api/admin/google/callback/route.ts", import.meta.url),
    "utf8",
  );
  const start = await readFile(
    new URL("../app/api/admin/google/start/route.ts", import.meta.url),
    "utf8",
  );
  const availability = await readFile(new URL("../lib/availability.ts", import.meta.url), "utf8");

  assert.match(oauth, /code_challenge_method: "S256"/);
  assert.match(oauth, /access_type: "offline"/);
  assert.match(oauth, /requiredScopes\.every\(\(scope\) => grantedScopes\.has\(scope\)\)/);
  assert.match(oauth, /byteLength < 32/);
  assert.match(oauth, /runtime\.SITE_ORIGIN !== CANONICAL_SITE_ORIGIN/);
  assert.match(oauth, /new URL\("\/api\/admin\/google\/callback", CANONICAL_SITE_ORIGIN\)/);
  assert.doesNotMatch(oauth, /polite-drake-5642\.chatgpt\.site/);
  assert.match(start, /canAccessEmployee\(user, employeeId\)/);
  assert.match(callback, /DELETE FROM calendar_oauth_states[\s\S]*lower\(user_email\) = \?[\s\S]*RETURNING employee_id,user_email,code_verifier/);
  assert.match(callback, /\.bind\(stateHash, now, user\.email\.toLowerCase\(\)\)/);
  assert.match(callback, /new URL\("\/admin\/integracije", CANONICAL_SITE_ORIGIN\)/);
  assert.match(callback, /encryptSecret\(tokens\.refreshToken/);
  assert.match(availability, /if \(!googleConnected\) return \{ checked: false, timesByDate \}/);
  assert.match(availability, /if \(google === null\) return \{ checked: false, timesByDate \}/);
  const calendar = await readFile(new URL("../lib/google-calendar.ts", import.meta.url), "utf8");
  assert.match(calendar, /FROM google_calendar_connections WHERE employee_id = \? LIMIT 1/);
  assert.match(calendar, /if \(!row\.connection_id\)[\s\S]*state: "invalid"/);
  assert.doesNotMatch(calendar, /GOOGLE_REFRESH_TOKEN_|legacyCalendarConfig/);
  assert.match(calendar, /attendees: \[\{ email: input\.clientEmail/);
  assert.match(calendar, /events`\;\n  const insertEndpoint = `\$\{endpoint\}\?sendUpdates=all`/);
  assert.match(calendar, /events\/\$\{encodeURIComponent\(eventId\)\}\?sendUpdates=all/);
});

test("offers Google and Apple through the dispatch-owned secure sign-in flow", async () => {
  const login = await readFile(new URL("../app/prijava/page.tsx", import.meta.url), "utf8");
  const auth = await readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const booking = await readFile(new URL("../app/rezervacija/page.tsx", import.meta.url), "utf8");
  assert.match(login, /Google/);
  assert.match(login, /Apple/);
  assert.match(login, /chatGPTSignInPath\("\/admin"\)/);
  assert.match(auth, /\/signin-with-chatgpt/);
  assert.match(home, /href="\/prijava">Prijava za tim/);
  assert.match(booking, /href="\/prijava">Prijava za tim/);
});

test("uses the approved ornate crest in browser metadata", async () => {
  const logo = await readFile(
    new URL("../public/brand/marinela-signature-on-dark.svg", import.meta.url),
    "utf8",
  );
  const favicon = await readFile(new URL("../public/marinela-favicon-ornate.svg", import.meta.url), "utf8");

  assert.match(logo, /woman profile and flowing hair/);
  assert.match(favicon, /viewBox="0 0 64 64"/);
  assert.match(favicon, /woman profile and flowing hair/);
  assert.doesNotMatch(favicon, />M<|Gold Marinela M on black/);
});

test("sends truthful booking emails and schedules the 24-hour reminder", async () => {
  const email = await readFile(new URL("../lib/email.ts", import.meta.url), "utf8");
  const emailTemplate = await readFile(
    new URL("../lib/booking-email-template.ts", import.meta.url),
    "utf8",
  );
  const notifications = await readFile(
    new URL("../lib/booking-notifications.ts", import.meta.url),
    "utf8",
  );
  const bookingApi = await readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");
  const adminBookingApi = await readFile(
    new URL("../app/api/admin/bookings/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL("../drizzle/0002_normal_komodo.sql", import.meta.url),
    "utf8",
  );
  const providerMigration = await readFile(
    new URL("../drizzle/0012_common_wilson_fisk.sql", import.meta.url),
    "utf8",
  );

  assert.match(email, /input\.bookingId[\s\S]*input\.type[\s\S]*lifecycleKey/);
  assert.match(email, /String\(input\.generation \?\? 0\)/);
  assert.match(email, /scheduled_at: input\.scheduledAt/);
  assert.match(email, /booking_id[\s\S]*input\.bookingId/);
  assert.match(email, /bookingEmailProviderAccountKey/);
  assert.match(email, /findBookingReminderProviderIds/);
  assert.match(email, /verifyBookingReminderProvider/);
  assert.match(email, /payload\.last_event === "scheduled"/);
  assert.match(email, /"canceled"/);
  assert.match(email, /\/emails\/\$\{encodeURIComponent\(providerId\)\}\/cancel/);
  assert.match(email, /email_not_configured/);
  assert.match(email, /renderBookingEmail\(\{[\s\S]*organizerEmail: senderEmail\(from\)/);
  assert.match(email, /input\.scheduledAt \?\? "now"/);
  assert.doesNotMatch(email, /`sequence-\$\{input\.calendarSequence/);
  assert.match(email, /filename: "marinela-hair-design-termin\.ics"/);
  assert.match(email, /content: utf8Base64\(content\.calendar\.ics\)/);
  assert.match(emailTemplate, /role="presentation"/);
  assert.match(emailTemplate, /max-width:640px/);
  assert.match(emailTemplate, /marinela-email-signature-v2\.png/);
  assert.doesNotMatch(emailTemplate, /marinela-email-lockup\.png/);
  assert.match(emailTemplate, /DODAJ U GOOGLE KALENDAR/);
  assert.match(emailTemplate, /BEGIN:VCALENDAR/);
  assert.match(emailTemplate, /`STATUS:\$\{cancelled \? "CANCELLED" : "CONFIRMED"\}`/);
  assert.match(emailTemplate, /@media only screen and \(max-width: 620px\)/);
  assert.match(emailTemplate, /TESTNI PRIKAZ · NIJE STVORENA STVARNA REZERVACIJA/);
  assert.match(emailTemplate, /const eyebrowColor = input\.type === "cancellation" \? accent : "#7A542F"/);
  assert.match(emailTemplate, /border-left:3px solid \$\{accent\}[\s\S]*color:\$\{eyebrowColor\}/);
  assert.match(notifications, /status === "sent" \|\| job\.status === "scheduled"/);
  assert.match(notifications, /SET status = 'sending', attempts = attempts \+ 1/);
  assert.match(notifications, /status IN \('pending','failed'\)/);
  assert.match(notifications, /if \(job\.status === "sending"\)/);
  assert.match(notifications, /job\.delivery_key \? \{ deliveryKey: job\.delivery_key \}/);
  assert.match(notifications, /calendarStamp: job\.created_at/);
  assert.match(notifications, /payload_snapshot/);
  assert.match(notifications, /booking\.operation_token IS NULL OR booking\.operation_token = \?/);
  assert.match(notifications, /job\.status = 'sending' AND job\.updated_at <= \?/);
  assert.match(notifications, /getBookingEmailProviderStatus/);
  assert.match(notifications, /currentProviderAccountKey !== job\.provider_account_key/);
  assert.match(notifications, /providerVerified = await verifyBookingReminderProvider/);
  assert.match(notifications, /!proof\.complete \|\| !providerIds\.size/);
  assert.match(notifications, /provider_account_key IS \?/);
  assert.match(notifications, /firstAttempt >= Date\.now\(\) - 24 \* 60 \* 60 \* 1000/);
  assert.match(notifications, /sendBookingEmail\(\{[\s\S]*scheduledAt: job\.due_at/);
  assert.match(notifications, /findBookingReminderProviderIds\(\{/);
  assert.match(notifications, /SET status = 'scheduled', provider_id = \?/);
  assert.match(notifications, /provider_generation = provider_generation \+ 1/);
  assert.match(notifications, /const failedBeforeProvider =\s*job\.attempts === 1/);
  assert.match(notifications, /notificationResultWasPersisted\(before, "scheduled", input\.providerId\)/);
  assert.match(notifications, /const providerResolved = await providerReminderIsResolved\(input\.providerId\)/);
  assert.match(notifications, /last_error = 'schedule_persist_failed'/);
  assert.match(notifications, /reset\.provider_generation > input\.providerGeneration/);
  assert.match(notifications, /reconciled === "committed"/);
  assert.match(notifications, /if \(!providersResolved\)/);
  assert.match(notifications, /reminderMatchesBooking/);
  assert.match(notifications, /last_error = 'superseded'/);
  assert.match(notifications, /job\.type != 'reschedule' OR job\.due_at = booking\.updated_at/);
  assert.match(notifications, /job\.updated_at <= CASE/);
  assert.doesNotMatch(notifications, /Date\.parse\(job\.due_at\) <= Date\.now\(\)/);
  assert.match(bookingApi, /emailAccepted: emailDelivery\.accepted/);
  assert.match(bookingApi, /isDateWithinBookingWindow\(date, now\)/);
  assert.match(bookingApi, /const status = "confirmed"/);
  assert.match(bookingApi, /type: "confirmation"[\s\S]*type: "reminder"/);
  assert.match(bookingApi, /confirmed: true/);
  assert.match(bookingApi, /\{ status: 201 \}/);
  assert.match(bookingApi, /rollbackPendingBooking/);
  assert.match(bookingApi, /const finalizedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(bookingApi, /SELECT status,updated_at,deleted_at,google_event_id,google_etag,google_connection_id/);
  assert.match(bookingApi, /current\.updated_at === finalizedAt/);
  assert.match(bookingApi, /current\.operation_token === operationToken/);
  assert.match(bookingApi, /if \(!finalizationCommitted && finalizationFailed\)/);
  assert.doesNotMatch(bookingApi, /status = confirmed \? "confirmed" : "pending_confirmation"/);
  assert.match(adminBookingApi, /action === "confirm"/);
  assert.match(adminBookingApi, /cancelBookingReminders/);
  assert.match(adminBookingApi, /type IN \('confirmation','reschedule'\)/);
  assert.ok(
    adminBookingApi.indexOf("const remindersCancelled = await cancelBookingReminders") < adminBookingApi.indexOf("SET status = 'cancelled'"),
    "scheduled reminders must be conclusively cancelled before local booking cancellation",
  );
  assert.match(migration, /ADD `provider_id` text/);
  assert.match(migration, /ADD `last_error` text/);
  assert.match(migration, /ADD `sent_at` text/);
  assert.match(providerMigration, /ADD `provider_account_key` text/);
  assert.match(providerMigration, /ADD `provider_generation` integer DEFAULT 0 NOT NULL/);
  const lifecycleMigration = await readFile(
    new URL("../drizzle/0015_square_shiver_man.sql", import.meta.url),
    "utf8",
  );
  assert.match(lifecycleMigration, /ADD `delivery_key` text/);
  const snapshotMigration = await readFile(
    new URL("../drizzle/0016_flashy_invaders.sql", import.meta.url),
    "utf8",
  );
  assert.match(snapshotMigration, /ADD `payload_snapshot` text/);
});

test("renders exact customer calendar artifacts with the approved email signature", async () => {
  const { renderBookingEmail } = await import("../lib/booking-email-template.ts");
  const rendered = renderBookingEmail({
    bookingId: "abc-123",
    type: "confirmation",
    email: "ivana@example.com",
    organizerEmail: "bookings@example.com",
    firstName: "Ivana",
    serviceName: "Šišanje i styling",
    staffName: "Marinela Grančić",
    dateLabel: "10.09.2026.",
    time: "10:30",
    startsAt: "2026-09-10T08:30:00.000Z",
    endsAt: "2026-09-10T09:30:00.000Z",
  });

  assert.ok(rendered.calendar);
  const google = new URL(rendered.calendar.googleUrl);
  assert.equal(google.origin, "https://calendar.google.com");
  assert.equal(google.searchParams.get("action"), "TEMPLATE");
  assert.equal(google.searchParams.get("dates"), "20260910T083000Z/20260910T093000Z");
  assert.equal(google.searchParams.get("ctz"), "Europe/Zagreb");
  assert.match(google.searchParams.get("text") ?? "", /Šišanje i styling/);
  assert.match(rendered.html, /DODAJ U GOOGLE KALENDAR/);
  assert.match(rendered.calendar.ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(rendered.calendar.ics, /UID:abc-123@marinelahairdesign\.com\r\n/);
  assert.match(rendered.calendar.ics, /DTSTART:20260910T083000Z\r\n/);
  assert.match(rendered.calendar.ics, /DTEND:20260910T093000Z\r\n/);
  assert.match(rendered.calendar.ics, /DTSTAMP:20260910T083000Z\r\n/);
  assert.match(rendered.calendar.ics, /STATUS:CONFIRMED\r\n/);
  assert.match(rendered.calendar.ics, /METHOD:REQUEST\r\n/);
  assert.match(rendered.calendar.ics, /ORGANIZER;CN="Marinela Hair Design":mailto:bookings@example\.com\r\n/);
  assert.match(rendered.calendar.ics, /ATTENDEE;CN="Ivana";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:ivana@example\.com\r\n/);
  assert.match(rendered.calendar.ics, /END:VCALENDAR\r\n$/);
  const renderedAgain = renderBookingEmail({
    bookingId: "abc-123",
    type: "confirmation",
    email: "ivana@example.com",
    organizerEmail: "bookings@example.com",
    firstName: "Ivana",
    serviceName: "Šišanje i styling",
    staffName: "Marinela Grančić",
    dateLabel: "10.09.2026.",
    time: "10:30",
    startsAt: "2026-09-10T08:30:00.000Z",
    endsAt: "2026-09-10T09:30:00.000Z",
  });
  assert.equal(renderedAgain.calendar?.ics, rendered.calendar.ics);

  const cancelled = renderBookingEmail({
    bookingId: "abc-123",
    type: "cancellation",
    email: "ivana@example.com",
    organizerEmail: "bookings@example.com",
    firstName: "Ivana",
    serviceName: "Šišanje i styling",
    staffName: "Marinela Grančić",
    dateLabel: "10.09.2026.",
    time: "10:30",
    startsAt: "2026-09-10T08:30:00.000Z",
    endsAt: "2026-09-10T09:30:00.000Z",
    calendarSequence: 2,
  });
  assert.ok(cancelled.calendar);
  assert.equal(cancelled.calendar.googleUrl, null);
  assert.match(cancelled.calendar.ics, /METHOD:CANCEL\r\n/);
  assert.match(cancelled.calendar.ics, /UID:abc-123@marinelahairdesign\.com\r\n/);
  assert.match(cancelled.calendar.ics, /SEQUENCE:2\r\n/);
  assert.match(cancelled.calendar.ics, /STATUS:CANCELLED\r\n/);

  const logo = await readFile(
    new URL("../public/brand/marinela-email-signature-v2.png", import.meta.url),
  );
  assert.equal(logo.readUInt32BE(16), 1128);
  assert.equal(logo.readUInt32BE(20), 680);
  assert.equal(
    createHash("sha256").update(logo).digest("hex"),
    "dbc9900170f735501890fdc2622d1a453eb06f32ed729ac922447b52e61a90ac",
  );
});

test("lets administrators manage services and working hours from durable settings", async () => {
  const settings = await readFile(new URL("../lib/salon-settings.ts", import.meta.url), "utf8");
  const availability = await readFile(new URL("../lib/availability.ts", import.meta.url), "utf8");
  const servicesPage = await readFile(new URL("../app/admin/usluge/page.tsx", import.meta.url), "utf8");
  const hoursPage = await readFile(new URL("../app/admin/radno-vrijeme/page.tsx", import.meta.url), "utf8");
  const serviceApi = await readFile(new URL("../app/api/admin/services/route.ts", import.meta.url), "utf8");
  const hoursApi = await readFile(new URL("../app/api/admin/opening-hours/route.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0003_concerned_blue_shield.sql", import.meta.url), "utf8");

  assert.match(settings, /FROM service_settings/);
  assert.match(settings, /FROM opening_hours/);
  assert.match(availability, /loadOpeningHours\(\{ strict: true \}\)/);
  assert.match(servicesPage, /canManageUsers\(user\)/);
  assert.match(hoursPage, /canManageUsers\(user\)/);
  assert.match(serviceApi, /service_created/);
  assert.match(hoursApi, /opening_hours_updated/);
  assert.match(migration, /INSERT OR IGNORE INTO `service_settings`/);
  assert.match(migration, /INSERT OR IGNORE INTO `opening_hours`/);
});

test("blocks Croatian public holidays in the date picker and on the booking server", async () => {
  const holidays = await import("../lib/croatian-holidays.ts");
  const availability = await readFile(new URL("../lib/availability.ts", import.meta.url), "utf8");
  const bookingDates = await readFile(new URL("../lib/booking-dates.ts", import.meta.url), "utf8");

  const holidays2026 = [
    "2026-01-01", "2026-01-06", "2026-04-05", "2026-04-06",
    "2026-05-01", "2026-05-30", "2026-06-04", "2026-06-22",
    "2026-08-05", "2026-08-15", "2026-11-01", "2026-11-18",
    "2026-12-25", "2026-12-26",
  ];
  for (const date of holidays2026) {
    assert.equal(holidays.isCroatianPublicHoliday(date), true, `${date} must be blocked`);
  }
  assert.equal(holidays.isCroatianPublicHoliday("2027-03-28"), true, "2027 Easter");
  assert.equal(holidays.isCroatianPublicHoliday("2027-03-29"), true, "2027 Easter Monday");
  assert.equal(holidays.isCroatianPublicHoliday("2027-05-27"), true, "2027 Corpus Christi");
  assert.equal(holidays.isCroatianPublicHoliday("2026-06-05"), false);
  assert.equal(holidays.isCroatianPublicHoliday("2026-02-30"), false);

  assert.match(availability, /if \(isCroatianPublicHoliday\(dateLocal\)\) return null/);
  assert.match(bookingDates, /while \(options\.length < 15\)/);
  assert.match(bookingDates, /if \(candidateIso > endDate\) break/);
  assert.match(bookingDates, /cursor\.getUTCDay\(\)/);
  assert.match(bookingDates, /entry\.dayOfWeek === weekday\)\?\.closed === false/);
  assert.match(bookingDates, /open && !isCroatianPublicHoliday\(candidateIso\)/);
  assert.match(bookingDates, /cursor\.setUTCDate\(cursor\.getUTCDate\(\) \+ 1\)/);
});

test("offers scoped cancellation and administrator-only recoverable booking deletion", async () => {
  const actions = await readFile(new URL("../app/admin/booking-actions.tsx", import.meta.url), "utf8");
  const bookingApi = await readFile(new URL("../app/api/admin/bookings/[id]/route.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");

  assert.match(actions, /Otkaži/);
  assert.match(actions, /Promijeni termin/);
  assert.match(actions, /Provjeri i potvrdi/);
  assert.match(actions, /\["pending_calendar", "pending_confirmation", "needs_attention"\]\.includes\(status\)/);
  assert.match(actions, /Potvrdi brisanje/);
  assert.match(bookingApi, /canAccessEmployee\(user, booking\.employee_id\)/);
  assert.match(bookingApi, /export async function DELETE/);
  assert.match(bookingApi, /canManageUsers\(user\)/);
  assert.match(bookingApi, /booking_deleted/);
  assert.match(bookingApi, /google_calendar_delete_failed/);
  assert.match(bookingApi, /calendarConnected && !googleEvent/);
  assert.match(bookingApi, /export async function PUT/);
  assert.match(bookingApi, /booking\.status !== "confirmed"/);
  assert.match(bookingApi, /availableTimes\([\s\S]*service,[\s\S]*booking\.employee_id,[\s\S]*date,[\s\S]*excludeBookingId/);
  assert.match(bookingApi, /excludeGoogleEvent/);
  assert.match(bookingApi, /updateGoogleBooking\(\{/);
  assert.match(bookingApi, /action: "booking_rescheduled"/);
  assert.match(bookingApi, /type: "reschedule"/);
  assert.match(bookingApi, /SET date_local = \?, start_time_local = \?, end_time_local = \?/);
  assert.match(bookingApi, /slot_key NOT IN/);
  assert.match(schema, /deletedAt: text\("deleted_at"\)/);
});

test("preserves service buffers and throttles public booking traffic", async () => {
  const availability = await readFile(new URL("../lib/availability.ts", import.meta.url), "utf8");
  const bookingApi = await readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");
  const rateLimit = await readFile(new URL("../lib/rate-limit.ts", import.meta.url), "utf8");
  const bufferMigration = await readFile(new URL("../drizzle/0004_melted_warlock.sql", import.meta.url), "utf8");
  const rateMigration = await readFile(new URL("../drizzle/0005_thin_malcolm_colcord.sql", import.meta.url), "utf8");

  assert.match(bookingApi, /blocked_until/);
  assert.match(availability, /COALESCE\(blocked_until,ends_at\)/);
  assert.match(bufferMigration, /ADD `blocked_until` text/);
  assert.match(rateLimit, /ON CONFLICT\(key\) DO UPDATE SET attempts = attempts \+ 1/);
  assert.match(rateMigration, /CREATE TABLE `request_rate_limits`/);
  assert.match(bookingApi, /status: 429/);
});

test("handles closed booking and dynamic single-staff states intentionally", async () => {
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const bookingPage = await readFile(new URL("../app/rezervacija/page.tsx", import.meta.url), "utf8");
  const serviceApi = await readFile(new URL("../app/api/admin/services/[id]/route.ts", import.meta.url), "utf8");

  assert.match(home, /service\.staffIds\[0\] === "mia" \? "Mia" : "Marinela"/);
  assert.match(bookingPage, /!services\.length \|\| !hasOpenDay/);
  assert.match(bookingPage, /Trenutačno nema otvorenih termina/);
  assert.match(serviceApi, /COUNT\(\*\) FROM service_settings WHERE active = 1\) > 1/);
  assert.match(serviceApi, /INSERT INTO admin_audit_log[\s\S]*FROM service_settings WHERE id = \? AND active = 0 AND updated_at = \?/);
});

test("publishes local SEO metadata, canonical routes, sitemap, and HairSalon structured data", async () => {
  const site = await readFile(new URL("../lib/site.ts", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const booking = await readFile(new URL("../app/rezervacija/page.tsx", import.meta.url), "utf8");
  const robots = await readFile(new URL("../app/robots.ts", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");

  assert.match(site, /https:\/\/www\.marinelahairdesign\.com/);
  assert.match(layout, /metadataBase: new URL\(CANONICAL_SITE_ORIGIN\)/);
  assert.match(layout, /<html lang="hr-HR">/);
  assert.match(home, /title: "Balayage i ekstenzije u Solinu"/);
  assert.match(home, /"@type": "HairSalon"/);
  assert.match(home, /openingHoursSpecification/);
  assert.match(home, /hasOfferCatalog/);
  assert.match(home, /premium frizerski salon u Solinu/);
  assert.match(home, /hero-desktop\.webp[\s\S]*fetchPriority="high"/);
  assert.match(booking, /alternates: \{ canonical: "\/rezervacija" \}/);
  assert.doesNotMatch(robots, /"\/admin/);
  assert.doesNotMatch(robots, /"\/prijava"/);
  assert.match(robots, /canonicalUrl\("\/sitemap\.xml"\)/);
  assert.match(sitemap, /canonicalUrl\("\/rezervacija"\)/);
});

test("keeps private routes out of search and the temporary Sites host out of the index", async () => {
  const adminLayout = await readFile(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");
  const login = await readFile(new URL("../app/prijava/page.tsx", import.meta.url), "utf8");
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");

  assert.match(adminLayout, /index: false/);
  assert.match(login, /index: false/);
  assert.match(worker, /!canonicalHosts\.has\(url\.hostname\.toLowerCase\(\)\)/);
  assert.match(worker, /hostname === apexHost \|\| hostname === legacySiteHost[\s\S]*url\.pathname === "\/api\/admin\/google\/callback"/);
  assert.match(worker, /restart\.searchParams\.set\("reason", "restart"\)/);
  assert.match(worker, /status: 303/);
  assert.match(worker, /hostname === apexHost \|\| hostname === legacySiteHost/);
  assert.match(worker, /const canonicalHost = new URL\(CANONICAL_SITE_ORIGIN\)\.hostname/);
  assert.match(worker, /destination\.hostname = canonicalHost/);
  assert.match(worker, /url\.port && url\.port !== "443"/);
  assert.match(worker, /status: 308/);
  assert.match(worker, /X-Robots-Tag/);
  assert.match(worker, /noindex, nofollow, noarchive/);
  assert.match(worker, /async scheduled\(/);
  assert.match(worker, /drainBookingNotificationOutbox\(5\)/);
});

test("applies browser security headers and strict anti-automation verification", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const turnstile = await readFile(new URL("../lib/turnstile.ts", import.meta.url), "utf8");
  const bookingApi = await readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");
  const bookingPage = await readFile(new URL("../app/rezervacija/page.tsx", import.meta.url), "utf8");

  assert.match(worker, /Content-Security-Policy/);
  assert.match(worker, /frame-ancestors/);
  assert.match(worker, /X-Frame-Options/);
  assert.match(worker, /Strict-Transport-Security/);
  assert.match(worker, /Referrer-Policy/);
  assert.match(turnstile, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(turnstile, /result\.action === "booking"/);
  assert.match(turnstile, /allowedHostnames\.has/);
  assert.match(turnstile, /AbortSignal\.timeout\(5_000\)/);
  assert.match(turnstile, /const required = true/);
  assert.match(bookingApi, /turnstile\.partial \|\| \(turnstile\.required && !turnstile\.configured\)/);
  assert.match(bookingPage, /!turnstile\.configured \|\| turnstile\.partial/);
  assert.match(bookingPage, /Online rezervacije trenutačno nisu dostupne/);
  assert.ok(
    bookingApi.indexOf("verifyTurnstileToken") < bookingApi.indexOf('scope: "booking_email"'),
    "Turnstile must run before per-contact rate-limit writes",
  );
});

test("bounds JSON requests and fails closed when abuse or availability storage cannot be checked", async () => {
  const requestSecurity = await readFile(new URL("../lib/request-security.ts", import.meta.url), "utf8");
  const bookingApi = await readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");
  const availabilityApi = await readFile(new URL("../app/api/availability/route.ts", import.meta.url), "utf8");
  const availability = await readFile(new URL("../lib/availability.ts", import.meta.url), "utf8");

  assert.match(requestSecurity, /request\.body\?\.getReader\(\)/);
  assert.match(requestSecurity, /totalBytes > maxBytes/);
  assert.match(requestSecurity, /TextDecoder\("utf-8", \{ fatal: true \}\)/);
  assert.match(requestSecurity, /!value \|\| typeof value !== "object" \|\| Array\.isArray\(value\)/);
  assert.match(bookingApi, /readJsonBody<BookingPayload>\(request, 12_288\)/);
  assert.match(bookingApi, /scope: "booking_ip"[\s\S]*failureMode: "deny"/);
  assert.match(availabilityApi, /scope: "availability_ip"[\s\S]*failureMode: "deny"/);
  assert.ok(
    availabilityApi.indexOf("const allowed = await consumeRateLimit") < availabilityApi.indexOf("const services = await loadServices"),
    "availability rate limiting must run before catalog database work",
  );
  assert.match(availability, /if \(local === null\) return \{ checked: false, timesByDate \}/);
});

test("makes booking retries idempotent and calendar operations recoverable", async () => {
  const bookingExperience = await readFile(new URL("../app/booking-experience.tsx", import.meta.url), "utf8");
  const bookingApi = await readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8");
  const adminBookingApi = await readFile(new URL("../app/api/admin/bookings/[id]/route.ts", import.meta.url), "utf8");
  const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0006_true_the_captain.sql", import.meta.url), "utf8");
  const connectionMigration = await readFile(
    new URL("../drizzle/0009_fast_madame_web.sql", import.meta.url),
    "utf8",
  );

  assert.match(bookingExperience, /const idempotencyKey = useRef<string \| null>\(null\)/);
  assert.match(bookingExperience, /const requestKey = idempotencyKey\.current \?\? crypto\.randomUUID\(\)/);
  assert.match(bookingApi, /sameBookingRequest/);
  assert.match(bookingApi, /bookingRequestFingerprint/);
  assert.match(bookingApi, /input\.note/);
  assert.match(bookingApi, /request_fingerprint/);
  assert.ok(
    bookingApi.indexOf("const duplicate = await existingIdempotentBooking") < bookingApi.indexOf("await verifyTurnstileToken"),
    "idempotent retries must resolve before a one-use anti-bot token is consumed",
  );
  assert.match(bookingApi, /operation_action,operation_started_at/);
  assert.match(bookingApi, /INSERT INTO bookings[\s\S]*WHERE NOT EXISTS \([\s\S]*existing\.starts_at < \?[\s\S]*COALESCE\(existing\.blocked_until, existing\.ends_at\) > \?/);
  assert.match(bookingApi, /const claimExpiry = blockedUntil\.toISOString\(\)/);
  assert.match(bookingApi, /INSERT INTO slot_claims[\s\S]*WHERE EXISTS \([\s\S]*operation_token = \?/);
  assert.doesNotMatch(bookingApi, /if \(confirmed\) \{\s*await env\.DB\.prepare\("DELETE FROM slot_claims/);
  assert.match(bookingApi, /status = 'pending_calendar'[\s\S]*operation_token = \?/);
  assert.match(bookingApi, /deleteGoogleBooking\([\s\S]*googleEvent\.connectionId/);
  assert.match(bookingApi, /connection\.connection_id = \?[\s\S]*connection\.employee_id = \?/);
  assert.match(bookingApi, /"uncertain" in calendarWrite/);
  assert.match(bookingApi, /status = 'needs_attention'[\s\S]*google_connection_id = \?/);
  assert.match(bookingApi, /let finalization;[\s\S]*try \{[\s\S]*\[finalization\] = await env\.DB\.batch/);
  assert.match(bookingApi, /catch \{[\s\S]*googleEvent[\s\S]*status = 'needs_attention'/);
  assert.ok(
    bookingApi.indexOf("type: \"reminder\"") < bookingApi.lastIndexOf("SET operation_token = NULL"),
    "the public create claim must remain held through reminder scheduling",
  );
  assert.match(adminBookingApi, /claimBookingOperation/);
  assert.match(adminBookingApi, /calendarCreationIsFresh/);
  assert.match(adminBookingApi, /googleEventIdForBooking\(booking\.id\)/);
  assert.match(adminBookingApi, /!eventIdToCancel && booking\.status !== "cancelled"/);
  assert.match(adminBookingApi, /!eventIdToRemove && booking\.status !== "cancelled"/);
  assert.match(adminBookingApi, /calendarDeletion\.eventDeleted/);
  assert.doesNotMatch(adminBookingApi, /booking\.status !== "cancelled" && !calendarCancellationSent/);
  assert.match(adminBookingApi, /if \(booking\.status !== "cancelled"\) \{[\s\S]*type: "cancellation"/);
  assert.match(adminBookingApi, /markBookingNeedsAttention/);
  assert.match(adminBookingApi, /recoveringUncertainCreate/);
  assert.match(adminBookingApi, /!uncertainConnectionIsActive/);
  assert.match(adminBookingApi, /retainUncertainCreateOperation/);
  assert.match(adminBookingApi, /cancellationCleanupCompleted/);
  assert.match(adminBookingApi, /deletionCleanupCompleted/);
  assert.match(adminBookingApi, /booking\.google_connection_id/);
  assert.match(adminBookingApi, /SELECT slot_key FROM slot_claims WHERE booking_id = \? AND employee_id = \?/);
  assert.match(adminBookingApi, /calendar_sequence = calendar_sequence \+ 1/);
  assert.match(adminBookingApi, /status IN \('pending','failed','sending'\)/);
  assert.match(adminBookingApi, /job\.status = 'sending' AND job\.updated_at >= \?/);
  assert.match(adminBookingApi, /database_finalize_uncertain/);
  assert.match(adminBookingApi, /storedBlockedUntil/);
  assert.ok(
    (adminBookingApi.match(/DELETE FROM slot_claims/g) ?? []).length >= 4,
    "slot claims must support scoped reschedule cleanup plus cancellation and deletion",
  );
  assert.match(adminBookingApi, /DELETE FROM slot_claims[\s\S]*EXISTS \([\s\S]*FROM bookings/);
  assert.match(adminPage, /operation_started_at < \?/);
  assert.doesNotMatch(adminPage, /finalizeGoogleCalendarCleanup/);
  assert.match(migration, /ADD `operation_token` text/);
  assert.match(migration, /ADD `operation_action` text/);
  assert.match(connectionMigration, /ADD `google_connection_id` text/);
  assert.match(connectionMigration, /ADD `connection_id` text/);
  assert.match(connectionMigration, /SET `connection_id` = 'legacy-'/);
  const lifecycleMigration = await readFile(
    new URL("../drizzle/0015_square_shiver_man.sql", import.meta.url),
    "utf8",
  );
  assert.match(lifecycleMigration, /ADD `request_fingerprint` text/);
  assert.match(lifecycleMigration, /ADD `calendar_sequence` integer DEFAULT 0 NOT NULL/);
  const calendar = await readFile(new URL("../lib/google-calendar.ts", import.meta.url), "utf8");
  assert.match(calendar, /response\.ok\)[\s\S]*targetVerified = true[\s\S]*eventDeleted = true/);
  assert.match(calendar, /response\.status === 404 \|\| response\.status === 410[\s\S]*targetVerified = true/);
  assert.match(calendar, /exactConnection[\s\S]*exactTargetKey/);
  assert.match(calendar, /ok: allTargetsVerified/);
  assert.match(calendar, /uncertain: true as const/);
  assert.match(calendar, /export async function updateGoogleBooking/);
  assert.match(calendar, /export async function readGoogleBusyExcludingEvent/);
  assert.match(calendar, /item\.id === excludedEventId/);
  assert.match(calendar, /activeAuth\.connectionId === exactAuth\.connectionId/);
  assert.match(calendar, /readGoogleEventBusy\(activeAuth, startsAt, endsAt, null\)/);
  assert.match(calendar, /method: "PATCH"/);
  assert.match(calendar, /\?sendUpdates=all/);
  assert.match(calendar, /status IN \('pending_calendar','pending_confirmation','needs_attention'\)/);
});

test("uses only encrypted, user-connected calendars and retires legacy environment tokens", async () => {
  const calendar = await readFile(new URL("../lib/google-calendar.ts", import.meta.url), "utf8");
  const usersApi = await readFile(new URL("../app/api/admin/users/[id]/route.ts", import.meta.url), "utf8");
  const callback = await readFile(new URL("../app/api/admin/google/callback/route.ts", import.meta.url), "utf8");
  const accountMigration = await readFile(new URL("../drizzle/0009_fast_madame_web.sql", import.meta.url), "utf8");
  const cleanupMigration = await readFile(new URL("../drizzle/0008_noisy_quentin_quire.sql", import.meta.url), "utf8");
  const revocationMigration = await readFile(new URL("../drizzle/0010_right_iceman.sql", import.meta.url), "utf8");

  assert.match(calendar, /decryptSecret\(row\.refresh_token_encrypted/);
  assert.match(calendar, /stored\.state === "invalid"[\s\S]*throw new Error/);
  assert.doesNotMatch(calendar, /GOOGLE_REFRESH_TOKEN_|GOOGLE_CALENDAR_MARINELA|GOOGLE_CALENDAR_MIA/);
  assert.match(calendar, /FROM google_calendar_connections WHERE employee_id = \?/);
  assert.match(calendar, /UNION ALL[\s\S]*FROM google_calendar_cleanup_connections WHERE employee_id = \?/);
  assert.match(calendar, /finalizeGoogleCalendarCleanup/);
  assert.match(calendar, /revokeGoogleRefreshToken/);
  assert.match(calendar, /revocation_token = \?, revocation_started_at = \?/);
  assert.match(calendar, /google_connection_id = cleanup\.id/);
  assert.match(usersApi, /DELETE FROM google_calendar_connections/);
  assert.match(usersApi, /INSERT OR IGNORE INTO google_calendar_cleanup_connections/);
  assert.doesNotMatch(usersApi, /revokeGoogleRefreshToken|futureCalendarBookingDependencies/);
  assert.match(callback, /employee_id != \?/);
  assert.match(callback, /INSERT INTO google_calendar_connections[\s\S]*WHERE EXISTS[\s\S]*active = 1/);
  assert.match(callback, /INSERT OR IGNORE INTO google_calendar_cleanup_connections/);
  assert.ok(
    callback.indexOf("INSERT OR IGNORE INTO google_calendar_cleanup_connections") < callback.indexOf("updateStatement,"),
    "the previous credential must be archived before a replacement becomes active",
  );
  assert.match(callback, /replacementArchiveGuard/);
  assert.match(callback, /revocation_started_at >= \?/);
  assert.match(callback, /persistenceChanges/);
  assert.doesNotMatch(callback, /ON CONFLICT\(employee_id\) DO UPDATE/);
  assert.doesNotMatch(callback, /futureCalendarBookingDependencies|active_bookings|FROM bookings/);
  assert.match(callback, /UPDATE google_calendar_connections AS connection/);
  assert.match(callback, /connection\.refresh_token_encrypted = \?/);
  assert.match(callback, /connection\.connected_at = \?/);
  assert.match(callback, /connection\.updated_at = \?/);
  assert.match(callback, /NOT EXISTS \([\s\S]*existing\.employee_id = \?/);
  assert.match(accountMigration, /CREATE UNIQUE INDEX IF NOT EXISTS `google_calendar_connections_account_unique`/);
  assert.match(accountMigration, /ranked_connections/);
  assert.match(accountMigration, /INSERT OR IGNORE INTO `google_calendar_cleanup_connections`/);
  assert.ok(
    accountMigration.indexOf("INSERT OR IGNORE INTO `google_calendar_cleanup_connections`") < accountMigration.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS `google_calendar_connections_account_unique`"),
    "legacy duplicate calendar credentials must be archived before account uniqueness is enforced",
  );
  assert.match(cleanupMigration, /CREATE TABLE `google_calendar_cleanup_connections`/);
  assert.match(revocationMigration, /ADD `revocation_token` text/);
  assert.match(revocationMigration, /ADD `revocation_started_at` text/);
});

test("publishes a durable public price list with recoverable dashboard management", async () => {
  const pricePage = await readFile(new URL("../app/cjenik/page.tsx", import.meta.url), "utf8");
  const priceTabs = await readFile(
    new URL("../app/cjenik/price-list-tabs.tsx", import.meta.url),
    "utf8",
  );
  const priceData = await readFile(new URL("../app/price-list-data.ts", import.meta.url), "utf8");
  const priceLoader = await readFile(new URL("../lib/price-list.ts", import.meta.url), "utf8");
  const priceManager = await readFile(
    new URL("../app/admin/price-list-manager.tsx", import.meta.url),
    "utf8",
  );
  const priceCollectionApi = await readFile(
    new URL("../app/api/admin/price-list/route.ts", import.meta.url),
    "utf8",
  );
  const priceItemApi = await readFile(
    new URL("../app/api/admin/price-list/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const priceMigration = await readFile(
    new URL("../drizzle/0013_chemical_warpath.sql", import.meta.url),
    "utf8",
  );
  const header = await readFile(new URL("../app/site-header.tsx", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(pricePage, /alternates: \{ canonical: "\/cjenik" \}/);
  assert.match(pricePage, /loadPriceList\(\)/);
  assert.match(pricePage, /<SiteHeader priceListActive \/>/);
  assert.match(pricePage, /<PriceListTabs sections=\{sections\} \/>/);
  assert.doesNotMatch(pricePage, /href=\{`#\$\{section\.id\}`\}/);
  assert.match(priceTabs, /role="tablist"/);
  assert.match(priceTabs, /role="tab"/);
  assert.match(priceTabs, /aria-selected=\{selected\}/);
  assert.match(priceTabs, /role="tabpanel"/);
  assert.match(priceTabs, /hidden=\{hidden\}/);
  assert.match(priceTabs, /ArrowRight/);
  assert.match(priceTabs, /ArrowLeft/);
  assert.match(priceTabs, /event\.key === "Home"/);
  assert.match(priceTabs, /event\.key === "End"/);
  assert.match(priceTabs, /catalogRef\.current\?\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(priceTabs, /className="price-table"/);
  assert.match(priceTabs, /className="price-table" role="table"/);
  assert.match(priceTabs, /className="price-table-wrap"[\s\S]*role="region"[\s\S]*tabIndex=\{0\}/);
  assert.match(priceTabs, /className="price-single-value"[\s\S]*data-label="Cijena"/);
  assert.match(priceTabs, /className="price-single-grid"/);
  assert.match(priceTabs, /role="columnheader"/);
  assert.match(priceTabs, /role="rowheader"/);
  assert.match(priceTabs, /headers=\{table\.id \+ "-row-"/);
  assert.match(priceTabs, /className="price-cell-label"/);
  assert.match(priceTabs, /aria-label="Sredstvo plaćanja: gotovina"/);
  assert.match(priceTabs, /<span>Sredstvo plaćanja<\/span>[\s\S]*<strong>Gotovina<\/strong>/);
  assert.match(priceData, /id: "bojanja"[\s\S]*id: "sisanja"[\s\S]*id: "oblikovanje-kose"[\s\S]*id: "pramenovi-dekoloracije"[\s\S]*id: "ugradnja-ekstenzija"/);
  assert.match(priceData, /\["90,00 €", "5 cm"\]/);
  assert.match(priceLoader, /FROM price_list_items/);
  assert.match(priceLoader, /options\.includeInactive \|\| item\.active/);
  assert.match(priceLoader, /customRowsByTable/);
  assert.match(priceManager, /method: "POST"/);
  assert.match(priceManager, /method: "DELETE"/);
  assert.match(priceManager, /JSON\.stringify\(\{ active: true \}\)/);
  assert.match(priceManager, /Potvrdi uklanjanje/);
  assert.match(priceCollectionApi, /canManageUsers\(user\)/);
  assert.match(priceCollectionApi, /hasValidSameOrigin\(request\)/);
  assert.match(priceCollectionApi, /custom-\$\{crypto\.randomUUID\(\)\}/);
  assert.match(priceItemApi, /SET active = 0/);
  assert.match(priceItemApi, /price_list_item_restored/);
  assert.match(priceItemApi, /readJsonBody<PriceItemPayload>\(request, 4_096\)/);
  assert.match(priceMigration, /CREATE TABLE `price_list_items`/);
  assert.match(header, /href="\/cjenik"/);
  assert.match(sitemap, /canonicalUrl\("\/cjenik"\)/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.price-table td/);
  assert.match(css, /\.price-category\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.price-category-panel:focus-visible/);
  assert.match(css, /\.price-list-catalog \{[^}]*scroll-margin-top: 168px/);
  assert.match(css, /@media \(max-width: 1440px\)[\s\S]*\.price-category \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.price-category-heading h2 \{[\s\S]*font-size: clamp\(2\.8rem,3\.4vw,4\.2rem\)[\s\S]*overflow-wrap: break-word/);
  assert.match(css, /\.price-payment-note \{[\s\S]*display: inline-flex;[\s\S]*margin-top: 1\.35rem/);
  assert.doesNotMatch(css, /\.price-table td > span \{[^}]*white-space:\s*nowrap/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.price-table thead \{[\s\S]*clip-path: inset\(50%\)/);
  assert.doesNotMatch(css, /\.price-table td::before/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.price-cell-label \{[\s\S]*display: block/);
  assert.match(css, /button\[aria-selected="true"\]/);
  assert.match(css, /\.price-admin-actions \.price-admin-danger\.confirm/);
});

test("publishes Google-ready privacy and terms pages with visible footer links", async () => {
  const privacyPage = await readFile(new URL("../app/privatnost/page.tsx", import.meta.url), "utf8");
  const termsPage = await readFile(
    new URL("../app/uvjeti-koristenja/page.tsx", import.meta.url),
    "utf8",
  );
  const legalShell = await readFile(new URL("../app/legal-page-shell.tsx", import.meta.url), "utf8");
  const footerMeta = await readFile(new URL("../app/footer-meta.tsx", import.meta.url), "utf8");
  const homePage = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const pricePage = await readFile(new URL("../app/cjenik/page.tsx", import.meta.url), "utf8");
  const bookingPage = await readFile(new URL("../app/rezervacija/page.tsx", import.meta.url), "utf8");
  const bookingExperience = await readFile(
    new URL("../app/booking-experience.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(privacyPage, /Google API Services User Data Policy/);
  assert.match(privacyPage, /Limited Use/);
  assert.match(privacyPage, /Google korisnički podaci/);
  assert.match(termsPage, /Online rezervacija/);
  assert.match(legalShell, /href="\/privatnost"/);
  assert.match(legalShell, /href="\/uvjeti-koristenja"/);
  assert.match(footerMeta, /href="\/privatnost"/);
  assert.match(footerMeta, /href="\/uvjeti-koristenja"/);
  assert.match(homePage, /<FooterMeta \/>/);
  assert.match(pricePage, /<FooterMeta \/>/);
  assert.match(bookingPage, /href="\/privatnost"/);
  assert.match(bookingPage, /href="\/uvjeti-koristenja"/);
  assert.match(bookingExperience, /href="\/privatnost"[\s\S]*Politiku privatnosti/);
  assert.match(css, /\.legal-route/);
  assert.match(css, /\.booking-route-footer > nav/);
});

test("puts role-scoped Google Calendar sync actions on the main dashboard", async () => {
  const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(adminPage, /getGoogleCalendarConnectionStatus/);
  assert.match(adminPage, /googleOAuthSetup/);
  assert.match(adminPage, /canManageUsers\(user\)[\s\S]*\["marinela", "mia"\]/);
  assert.doesNotMatch(adminPage, /finalizeGoogleCalendarCleanup|cleanupEmployeeIds/);
  assert.match(adminPage, /\/api\/admin\/google\/start\?employeeId=\$\{employeeId\}/);
  assert.match(adminPage, /Sinkroniziraj \$\{employeeId === "marinela" \? "Marinelin" : "Mijin"\} kalendar/);
  assert.match(adminPage, /Čeka aktivaciju/);
  assert.match(css, /\.admin-calendar-sync-actions/);
  assert.match(css, /\.admin-calendar-sync-actions article > a[\s\S]*min-height: 44px/);
});

test("registers exactly five narrowly scoped WebMCP tools on public salon routes", async () => {
  const tools = await readFile(
    new URL("../app/webmcp-site-tools.tsx", import.meta.url),
    "utf8",
  );
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

  const names = [...tools.matchAll(/name:\s*"([a-z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(names, [
    "get_salon_information",
    "find_bookable_services",
    "search_price_list",
    "check_appointment_availability",
    "prepare_booking_for_confirmation",
  ]);
  assert.equal((tools.match(/additionalProperties:\s*false/g) ?? []).length, 5);
  assert.equal((tools.match(/\{ signal: registration\.signal \}/g) ?? []).length, 5);
  assert.match(tools, /new Set\(\["\/", "\/cjenik", "\/rezervacija", "\/concierge"\]\)/);
  assert.doesNotMatch(tools, /new Set\([^\n]*(?:\/admin|\/prijava)/);
  assert.match(tools, /if \(!publicToolPaths\.has\(pathname\) \|\| !document\.modelContext\?\.registerTool\) return/);
  assert.match(tools, /hasSafeShape\(input/);
  assert.match(tools, /priceSections\.includes\(section/);
  assert.match(tools, /!Array\.isArray\(rawDates\) \|\| rawDates\.length < 1 \|\| rawDates\.length > 7/);
  assert.match(tools, /rawDates\.length > 7/);
  assert.match(tools, /takeWithinCharacterBudget\(compactMatches, 1_050\)/);
  assert.match(tools, /takeWithinCharacterBudget\(limitedMatches, 1_050\)/);
  assert.match(tools, /maximum: 6/);
  assert.match(tools, /allSlots\.slice\(0, 3\)/);
  assert.match(tools, /registration\.abort\(\)/);
  assert.match(tools, /type ToolExecutionOptions = \{ signal\?: AbortSignal \}/);
  assert.match(tools, /!options\.signal\?\.aborted/);
  assert.match(tools, /options\.signal\?\.addEventListener\("abort"/);
  assert.match(layout, /<WebMcpSiteTools \/>/);
});

test("keeps WebMCP advisory and preparation tools fail-closed and free of booking writes", async () => {
  const tools = await readFile(
    new URL("../app/webmcp-site-tools.tsx", import.meta.url),
    "utf8",
  );
  const catalog = await readFile(
    new URL("../app/api/concierge/catalog/route.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(tools, /\/api\/bookings/);
  assert.doesNotMatch(tools, /name:\s*"(?:confirm|cancel|reschedule|lookup)_booking"/);
  assert.doesNotMatch(tools, /method:\s*"POST"/);
  assert.match(tools, /status:\s*"awaiting_human_confirmation"/);
  assert.match(tools, /bookingCreated:\s*false/);
  assert.match(tools, /It never creates, reserves or confirms an appointment/);
  assert.match(tools, /availability\.checked === false/);
  assert.match(tools, /status:\s*"verification_failed"/);
  assert.match(catalog, /loadServices\(\{ strict: true \}\)/);
  assert.match(catalog, /loadOpeningHours\(\{ strict: true \}\)/);
  assert.match(catalog, /loadPriceList\(\)/);
  assert.match(catalog, /failureMode:\s*"deny"/);
  assert.match(catalog, /fetchSite === "cross-site"/);
  assert.match(catalog, /status:\s*503/);
  assert.match(catalog, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(catalog, /bookings|google_calendar_connections|calendar_id|client_email/);
});

test("requires a visible human confirmation after an AI-prepared salon selection", async () => {
  const bookingPage = await readFile(
    new URL("../app/rezervacija/page.tsx", import.meta.url),
    "utf8",
  );
  const bookingExperience = await readFile(
    new URL("../app/booking-experience.tsx", import.meta.url),
    "utf8",
  );
  const concierge = await readFile(
    new URL("../app/concierge/page.tsx", import.meta.url),
    "utf8",
  );
  const privacy = await readFile(
    new URL("../app/privatnost/page.tsx", import.meta.url),
    "utf8",
  );
  const sitemap = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  const conciergeGuide = await readFile(
    new URL("../app/concierge/concierge-guide.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(bookingPage, /scope: "webmcp_prepare_ip"[\s\S]*failureMode: "deny"/);
  assert.match(bookingPage, /loadServices\(\{ strict: true \}\)/);
  assert.match(bookingPage, /requestedSource === "webmcp"[\s\S]*verifiedService[\s\S]*availableTimes\(verifiedService/);
  assert.match(bookingPage, /agentPrepared=\{Boolean\(preparedBooking\)\}/);
  assert.match(bookingExperience, /Termin još nije rezerviran/);
  assert.match(bookingExperience, /payload\.checked === false[\s\S]*agentPrepared && time[\s\S]*setTime\(""\)[\s\S]*setStep\(4\)/);
  assert.match(bookingExperience, /\.catch\(\(\) => \{[\s\S]*agentPrepared && time[\s\S]*setTime\(""\)[\s\S]*setStep\(4\)/);
  assert.match(bookingExperience, /<input name="firstName"[^>]*required \/>/);
  assert.match(bookingExperience, /<input name="consent" type="checkbox" required \/>/);
  assert.doesNotMatch(bookingExperience, /name="consent"[^>]*(?:checked|defaultChecked)/);
  assert.match(bookingExperience, /booking-turnstile/);
  assert.match(bookingExperience, /<button type="submit"[\s\S]*Potvrdi rezervaciju/);
  assert.match(concierge, /Agent ne postavlja medicinske dijagnoze/);
  assert.match(conciergeGuide, /marinela:webmcp-ready/);
  assert.match(conciergeGuide, /marinela:webmcp-error/);
  assert.match(conciergeGuide, /role="status"/);
  assert.match(conciergeGuide, /Kopiranje nije uspjelo — označite upit ručno/);
  assert.match(privacy, /AI concierge i WebMCP/);
  assert.match(privacy, /Ne šalju ni ne pohranjuju cijeli razgovor/);
  assert.match(sitemap, /canonicalUrl\("\/concierge"\)/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.concierge-console \{ order: -1;/);
  assert.match(css, /\.concierge-console-actions \.ghost-link \{[\s\S]*min-height: 44px/);
});

test("build output contains the production metadata", async () => {
  const workerSource = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  const workerConfig = JSON.parse(
    await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
  );

  assert.match(workerSource, /Marinela Hair Design \| Frizerski salon Solin/);
  assert.match(workerSource, /Premium frizerski salon u Solinu/);
  assert.match(workerSource, /\/marinela-favicon-ornate\.svg/);
  assert.match(workerSource, /\/og\.png/);
  assert.match(workerSource, /servedUrl:`\/robots\.txt`/);
  assert.match(workerSource, /servedUrl:`\/sitemap\.xml`/);
  assert.deepEqual(workerConfig.triggers?.crons, ["*/5 * * * *"]);
});
