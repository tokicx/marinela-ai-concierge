export type BookingEmailType =
  | "request_received"
  | "confirmation"
  | "reminder"
  | "reschedule"
  | "cancellation";

export type BookingEmailTemplateInput = {
  bookingId: string;
  email?: string;
  type: BookingEmailType;
  firstName: string;
  serviceName: string;
  staffName: string;
  dateLabel: string;
  time: string;
  startsAt: string;
  endsAt: string;
  calendarSequence?: number;
  calendarStamp?: string;
  organizerEmail?: string;
};

export type BookingEmailTemplateOptions = {
  testMode?: boolean;
};

const logoUrl =
  "https://www.marinelahairdesign.com/brand/marinela-email-signature-v2.png";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function contentFor(type: BookingEmailType) {
  if (type === "confirmation") {
    return {
      subject: "Vaš termin u Marinela Hair Design je potvrđen",
      eyebrow: "TERMIN POTVRĐEN",
      heading: "Vaš termin je rezerviran.",
      copy: "Termin je potvrđen i čeka vas u našem rasporedu.",
      preheader: "Potvrda termina i svi važni detalji vaše rezervacije.",
    };
  }
  if (type === "reminder") {
    return {
      subject: "Podsjetnik: sutra imate termin u Marinela Hair Design",
      eyebrow: "PODSJETNIK · 24 SATA",
      heading: "Vidimo se sutra.",
      copy: "Ovo je kratki podsjetnik na vaš termin koji je zakazan za sutra.",
      preheader: "Podsjetnik na sutrašnji termin u Marinela Hair Design.",
    };
  }
  if (type === "reschedule") {
    return {
      subject: "Vaš novi termin u Marinela Hair Design je potvrđen",
      eyebrow: "TERMIN PROMIJENJEN",
      heading: "Vaš novi termin je potvrđen.",
      copy: "Termin je uspješno promijenjen. U nastavku su novi, važeći podaci rezervacije.",
      preheader: "Potvrda promjene termina i novi podaci rezervacije.",
    };
  }
  if (type === "cancellation") {
    return {
      subject: "Vaš termin u Marinela Hair Design je otkazan",
      eyebrow: "TERMIN OTKAZAN",
      heading: "Termin je otkazan.",
      copy: "Ako želite novi termin, možete ga odabrati na našoj stranici za rezervacije.",
      preheader: "Potvrda otkazivanja termina u Marinela Hair Design.",
    };
  }
  return {
    subject: "Zaprimili smo vaš zahtjev za termin",
    eyebrow: "ZAHTJEV ZAPRIMLJEN",
    heading: "Hvala na rezervaciji.",
    copy: "Zahtjev je zaprimljen. Salon će provjeriti raspored i potvrditi termin u najkraćem roku.",
    preheader: "Vaš zahtjev za termin uspješno je zaprimljen.",
  };
}

function compactUtc(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeCalendarParameter(value: string) {
  return value.replace(/[\r\n"]/g, " ").trim();
}

function calendarArtifactsFor(
  input: BookingEmailTemplateInput,
  options: BookingEmailTemplateOptions,
) {
  if (input.type === "request_received") return null;
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return null;
  }

  const summary = `${options.testMode ? "[TEST] " : ""}Marinela Hair Design — ${input.serviceName}`;
  const description = [
    `Usluga: ${input.serviceName}`,
    `Stručnjak: ${input.staffName}`,
    "Kontakt salona: 095 556 5738",
  ].join("\n");
  const location = "Ulica kralja Zvonimira 14b, 21210 Solin";
  const cancelled = input.type === "cancellation";
  const dates = `${compactUtc(startsAt)}/${compactUtc(endsAt)}`;
  let googleUrl: string | null = null;
  if (!cancelled) {
    const calendarUrl = new URL("https://calendar.google.com/calendar/render");
    calendarUrl.searchParams.set("action", "TEMPLATE");
    calendarUrl.searchParams.set("text", summary);
    calendarUrl.searchParams.set("dates", dates);
    calendarUrl.searchParams.set("details", description);
    calendarUrl.searchParams.set("location", location);
    calendarUrl.searchParams.set("ctz", "Europe/Zagreb");
    googleUrl = calendarUrl.toString();
  }

  const safeUid = input.bookingId.replace(/[^a-zA-Z0-9._-]/g, "") || "booking";
  const defaultSequence = input.type === "reschedule" ? 1 : cancelled ? 2 : 0;
  const sequence = typeof input.calendarSequence === "number" &&
      Number.isSafeInteger(input.calendarSequence) && input.calendarSequence >= 0
    ? input.calendarSequence
    : defaultSequence;
  const method = cancelled ? "CANCEL" : "REQUEST";
  const requestedStamp = new Date(input.calendarStamp ?? input.startsAt);
  const calendarStamp = Number.isFinite(requestedStamp.getTime()) ? requestedStamp : startsAt;
  const organizerEmail = input.organizerEmail?.trim();
  const attendeeEmail = input.email?.trim();
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Marinela Hair Design//Rezervacije//HR",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${safeUid}@marinelahairdesign.com`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${compactUtc(calendarStamp)}`,
    `DTSTART:${compactUtc(startsAt)}`,
    `DTEND:${compactUtc(endsAt)}`,
    `SUMMARY:${escapeCalendarText(summary)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `LOCATION:${escapeCalendarText(location)}`,
    ...(organizerEmail
      ? [`ORGANIZER;CN="Marinela Hair Design":mailto:${organizerEmail}`]
      : []),
    ...(attendeeEmail
      ? [`ATTENDEE;CN="${escapeCalendarParameter(input.firstName)}";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${attendeeEmail}`]
      : []),
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return { googleUrl, ics };
}

export function renderBookingEmail(
  input: BookingEmailTemplateInput,
  options: BookingEmailTemplateOptions = {},
) {
  const content = contentFor(input.type);
  const safeFirstName = escapeHtml(input.firstName);
  const safeService = escapeHtml(input.serviceName);
  const safeStaff = escapeHtml(input.staffName);
  const safeDate = escapeHtml(input.dateLabel);
  const safeTime = escapeHtml(input.time);
  const accent = input.type === "cancellation" ? "#9B604C" : "#CAA36F";
  const eyebrowColor = input.type === "cancellation" ? accent : "#7A542F";
  const subject = options.testMode ? `[TEST] ${content.subject}` : content.subject;
  const calendar = calendarArtifactsFor(input, options);
  const testText = options.testMode
    ? "\n\nTESTNI PRIKAZ — nije stvorena stvarna rezervacija."
    : "";
  const testPanel = options.testMode
    ? `<tr>
        <td style="padding:0 48px 30px" class="content-pad">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #D9C6A8;background:#FBF8F3">
            <tr>
              <td style="padding:13px 18px;color:#6F4C2E;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;line-height:1.5;text-align:center">
                TESTNI PRIKAZ · NIJE STVORENA STVARNA REZERVACIJA
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";
  const calendarText = calendar
    ? calendar.googleUrl
      ? `\n\nDODAJ U SVOJ KALENDAR\nGoogle kalendar: ${calendar.googleUrl}\nApple Calendar ili Outlook: otvorite privitak marinela-hair-design-termin.ics.`
      : "\n\nAŽURIRAJ SVOJ KALENDAR\nApple Calendar ili Outlook: otvorite privitak marinela-hair-design-termin.ics kako biste uklonili otkazani termin."
    : "";
  const calendarPanel = calendar
    ? calendar.googleUrl
      ? `<tr>
        <td class="content-pad" style="padding:0 48px 42px;background:#FFFFFF">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td align="center" bgcolor="#CAA36F" style="background:#CAA36F">
                <a href="${escapeHtml(calendar.googleUrl)}" target="_blank" style="display:block;padding:16px 20px;color:#050505;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.7px;line-height:1.4;text-decoration:none">DODAJ U GOOGLE KALENDAR</a>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:14px;color:#756D64;font-family:Arial,sans-serif;font-size:12px;line-height:1.6">
                Apple Calendar ili Outlook? Otvorite priloženu datoteku <strong>marinela-hair-design-termin.ics</strong>.
              </td>
            </tr>
          </table>
        </td>
      </tr>`
      : `<tr>
        <td class="content-pad" style="padding:0 48px 42px;background:#FFFFFF">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #D9C6A8;background:#FBF8F3">
            <tr>
              <td align="center" style="padding:16px 20px;color:#6F4C2E;font-family:Arial,sans-serif;font-size:12px;line-height:1.6">
                Apple Calendar ili Outlook? Otvorite priloženu datoteku <strong>marinela-hair-design-termin.ics</strong> kako biste uklonili otkazani termin.
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const text = `${content.heading}\n\nPozdrav, ${input.firstName}. ${content.copy}${testText}\n\nUSLUGA\n${input.serviceName}\n\nSTRUČNJAK\n${input.staffName}\n\nTERMIN\n${input.dateLabel} u ${input.time}${calendarText}\n\nMarinela Hair Design\nUlica kralja Zvonimira 14b, 21210 Solin\n095 556 5738`;

  const html = `<!doctype html>
<html lang="hr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>${subject}</title>
    <style>
      :root { color-scheme: light only; supported-color-schemes: light only; }
      body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { border-collapse: collapse !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
      @media only screen and (max-width: 620px) {
        .outer-pad { padding: 0 !important; }
        .email-shell { border-left: 0 !important; border-right: 0 !important; width: 100% !important; }
        .brand-pad { padding: 28px 24px 26px !important; }
        .content-pad { padding-left: 26px !important; padding-right: 26px !important; }
        .hero-pad { padding-top: 38px !important; padding-bottom: 30px !important; }
        .email-heading { font-size: 34px !important; line-height: 1.08 !important; }
        .detail-label { width: 34% !important; }
        .detail-value { width: 66% !important; }
        .footer-pad { padding: 28px 26px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#EEE9E2;color:#0D0D0D;font-family:Arial,sans-serif">
    <div style="display:none;font-size:1px;color:#EEE9E2;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">
      ${options.testMode ? "Testni prikaz — " : ""}${content.preheader}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#EEE9E2">
      <tr>
        <td align="center" class="outer-pad" style="padding:42px 16px">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:100%;max-width:640px;background:#FFFFFF;border:1px solid #D8D0C6">
            <tr>
              <td bgcolor="#050505" class="brand-pad" style="padding:24px 48px 22px;border-top:3px solid #CAA36F;text-align:center">
                <img src="${logoUrl}" width="224" alt="Marinela Hair Design" style="display:block;width:224px;max-width:100%;height:auto;margin:0 auto">
              </td>
            </tr>
            <tr>
              <td class="content-pad hero-pad" style="padding:48px 48px 34px;background:#FFFFFF">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td>
                      <span style="display:inline-block;border-left:3px solid ${accent};padding:2px 0 2px 12px;color:${eyebrowColor};font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2.6px;line-height:1.5">${content.eyebrow}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:22px">
                      <h1 class="email-heading" style="margin:0;color:#0D0D0D;font-family:Georgia,'Times New Roman',serif;font-size:42px;font-weight:400;letter-spacing:-1px;line-height:1.08">${content.heading}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:18px;color:#625B53;font-family:Arial,sans-serif;font-size:15px;line-height:1.75">
                      Pozdrav, ${safeFirstName}. ${content.copy}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${testPanel}
            <tr>
              <td class="content-pad" style="padding:0 48px ${calendar ? "24px" : "42px"};background:#FFFFFF">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #D8D0C6">
                  <tr>
                    <td align="center" bgcolor="#0D0D0D" style="padding:24px 22px 23px;border-top:3px solid ${accent}">
                      <div style="color:#C9A46A;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:2.8px;line-height:1.5">DATUM I VRIJEME</div>
                      <div style="padding-top:9px;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.25">${safeDate}</div>
                      <div style="padding-top:3px;color:#E3C39D;font-family:Georgia,'Times New Roman',serif;font-size:29px;line-height:1.2">${safeTime}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 22px;background:#F7F3EC">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td width="36%" class="detail-label" style="width:36%;padding:18px 12px 18px 0;border-bottom:1px solid #D8D0C6;color:#7A542F;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:1.8px;line-height:1.5;vertical-align:top">USLUGA</td>
                          <td width="64%" class="detail-value" style="width:64%;padding:16px 0 16px 12px;border-bottom:1px solid #D8D0C6;color:#0D0D0D;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.5;vertical-align:top">${safeService}</td>
                        </tr>
                        <tr>
                          <td width="36%" class="detail-label" style="width:36%;padding:18px 12px 18px 0;color:#7A542F;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:1.8px;line-height:1.5;vertical-align:top">STRUČNJAK</td>
                          <td width="64%" class="detail-value" style="width:64%;padding:16px 0 16px 12px;color:#0D0D0D;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.5;vertical-align:top">${safeStaff}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${calendarPanel}
            <tr>
              <td bgcolor="#050505" class="footer-pad" style="padding:30px 48px;text-align:center">
                <p style="margin:0;color:#C9A46A;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:2.5px;line-height:1.6">MARINELA HAIR DESIGN · SOLIN</p>
                <p style="margin:10px 0 0;color:#BDB5AC;font-family:Arial,sans-serif;font-size:12px;line-height:1.75">Ulica kralja Zvonimira 14b, 21210 Solin<br><a href="tel:+385955565738" style="color:#FFFFFF;text-decoration:none">095 556 5738</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html, calendar };
}
