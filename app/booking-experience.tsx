"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBookingDateOptions, type BookingDateOption } from "../lib/booking-dates";
import { team, type Service } from "./salon-data";
import type { OpeningHourSetting } from "../lib/salon-settings";

type BookingStep = 1 | 2 | 3 | 4 | 5;
type StaffChoice = "marinela" | "mia" | "first";
type DateCheckState = "checking" | "available" | "full" | "error";
type AvailabilityPayload = {
  times?: string[];
  employeeByTime?: Record<string, "marinela" | "mia">;
  checked?: boolean;
};

const stepNames = ["Usluga", "Stručnjak", "Datum", "Vrijeme", "Podaci"];

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: Record<string, string | boolean | ((token?: string) => void)>,
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export default function BookingExperience({
  initialServiceId,
  initialStaffId,
  initialDate,
  initialTime,
  agentPrepared = false,
  services,
  openingHours,
  bookingWindowStart,
  bookingWindowEnd,
  turnstileSiteKey,
}: {
  initialServiceId?: string;
  initialStaffId?: "marinela" | "mia";
  initialDate?: string;
  initialTime?: string;
  agentPrepared?: boolean;
  services: Service[];
  openingHours: OpeningHourSetting[];
  bookingWindowStart: string;
  bookingWindowEnd: string;
  turnstileSiteKey?: string;
}) {
  const initialService = services.find((service) => service.id === initialServiceId) ?? services[0];
  const preparedStaff = initialStaffId && initialService.staffIds.includes(initialStaffId)
    ? initialStaffId
    : initialService.staffIds[0];
  const [step, setStep] = useState<BookingStep>(agentPrepared ? 5 : 1);
  const [serviceId, setServiceId] = useState(initialService.id);
  const [staffId, setStaffId] = useState<StaffChoice>(preparedStaff);
  const [date, setDate] = useState(agentPrepared ? initialDate ?? "" : "");
  const [time, setTime] = useState(agentPrepared ? initialTime ?? "" : "");
  const [dates] = useState<BookingDateOption[]>(() =>
    createBookingDateOptions(openingHours, bookingWindowStart, bookingWindowEnd),
  );
  const [dateChecks, setDateChecks] = useState<Record<string, DateCheckState>>({});
  const [dateCheckMessage, setDateCheckMessage] = useState("");
  const [dateCheckVersion, setDateCheckVersion] = useState(0);
  const [timesRefreshVersion, setTimesRefreshVersion] = useState(0);
  const [times, setTimes] = useState<string[]>(agentPrepared && initialTime ? [initialTime] : []);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { confirmed: boolean; message: string }>(null);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const dateCheckSequence = useRef(0);
  const bookingPanel = useRef<HTMLDivElement>(null);
  const stepFocusPending = useRef(false);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId) ?? services[0],
    [serviceId, services],
  );
  const allowedTeam = team.filter((member) => selectedService.staffIds.includes(member.id));
  const selectedTeamMember =
    staffId === "first" ? null : team.find((member) => member.id === staffId) ?? null;
  const dateChecksPending = dates.some(
    (item) => (dateChecks[item.iso] ?? "checking") === "checking",
  );
  const hasAvailableDates = dates.some((item) => dateChecks[item.iso] === "available");
  const hasDateCheckErrors = dates.some((item) => dateChecks[item.iso] === "error");

  useEffect(() => {
    if (step !== 3 || !dates.length) return;
    const sequence = dateCheckSequence.current + 1;
    dateCheckSequence.current = sequence;
    let active = true;
    const controller = new AbortController();

    const params = new URLSearchParams({
      serviceId,
      staffId,
      dates: dates.map((item) => item.iso).join(","),
    });
    fetch(`/api/availability?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("availability");
        return (await response.json()) as { dates?: Record<string, AvailabilityPayload> };
      })
      .then((payload) => {
        if (!active || sequence !== dateCheckSequence.current) return;
        const nextChecks = Object.fromEntries(
          dates.map((item) => {
            const availability = payload.dates?.[item.iso];
            const state: DateCheckState = availability?.checked === false
              ? "error"
              : availability?.times?.length
                ? "available"
                : availability
                  ? "full"
                  : "error";
            return [item.iso, state];
          }),
        );
        setDateChecks(nextChecks);
        const hasErrors = Object.values(nextChecks).some((state) => state === "error");
        if (hasErrors) {
          setDateCheckMessage("Neke datume trenutačno nije moguće pouzdano provjeriti.");
        }
        setDate((current) => {
          if (!current || nextChecks[current] === "available") return current;
          setTime("");
          setTimes([]);
          return "";
        });
      })
      .catch((reason: unknown) => {
        if (
          !active ||
          sequence !== dateCheckSequence.current ||
          (reason instanceof DOMException && reason.name === "AbortError")
        ) return;
        setDateChecks(Object.fromEntries(dates.map((item) => [item.iso, "error"])));
        setDateCheckMessage("Raspoloživost datuma trenutačno nije moguće provjeriti.");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [dateCheckVersion, dates, serviceId, staffId, step]);

  useEffect(() => {
    if (!date) return;
    let active = true;
    const controller = new AbortController();

    const params = new URLSearchParams({
      serviceId,
      staffId,
      date,
    });
    fetch(`/api/availability?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("availability");
        return (await response.json()) as AvailabilityPayload;
      })
      .then((payload) => {
        if (!active) return;
        if (payload.checked === false) {
          setTimes([]);
          setError("Ovaj datum trenutačno nije moguće pouzdano provjeriti. Odaberite drugi datum ili pokušajte ponovno.");
          if (agentPrepared && time) {
            setTime("");
            stepFocusPending.current = true;
            setStep(4);
          }
          return;
        }
        const nextTimes = payload.times ?? [];
        setTimes(nextTimes);
        if (time && !nextTimes.includes(time)) {
          setTime("");
          if (agentPrepared) {
            setError("Termin koji je pripremio AI concierge više nije slobodan. Odaberite drugo vrijeme.");
            stepFocusPending.current = true;
            setStep(4);
          }
        }
      })
      .catch(() => {
        if (active) {
          setTimes([]);
          setError("Raspoloživost trenutačno nije moguće provjeriti. Pokušajte ponovno za trenutak.");
          if (agentPrepared && time) {
            setTime("");
            stepFocusPending.current = true;
            setStep(4);
          }
        }
      })
      .finally(() => {
        if (active) setLoadingTimes(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [agentPrepared, date, serviceId, staffId, selectedService.duration, selectedService.buffer, openingHours, time, timesRefreshVersion]);

  useEffect(() => {
    if (!stepFocusPending.current) return;
    stepFocusPending.current = false;
    requestAnimationFrame(() => {
      const heading = bookingPanel.current?.querySelector<HTMLElement>(".booking-step-heading h3");
      heading?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 900px)").matches) {
        bookingPanel.current?.scrollIntoView({ block: "start" });
      }
    });
  }, [step]);

  useEffect(() => {
    if (!turnstileSiteKey || step !== 5) return;
    let active = true;

    const renderWidget = () => {
      if (!active || !window.turnstile || !turnstileContainer.current || turnstileWidgetId.current) return;
      turnstileWidgetId.current = window.turnstile.render(turnstileContainer.current, {
        sitekey: turnstileSiteKey,
        action: "booking",
        theme: "light",
        size: "flexible",
        appearance: "interaction-only",
        callback: (token?: string) => setTurnstileToken(token ?? ""),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existing = document.querySelector<HTMLScriptElement>("script[data-marinela-turnstile]");
      const script = existing ?? document.createElement("script");
      if (!existing) {
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.marinelaTurnstile = "true";
        document.head.appendChild(script);
      }
      script.addEventListener("load", renderWidget, { once: true });
    }

    return () => {
      active = false;
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
      }
      setTurnstileToken("");
    };
  }, [step, turnstileSiteKey]);

  function resetSlotSelection() {
    idempotencyKey.current = null;
    setDate("");
    setTime("");
    setTimes([]);
    setLoadingTimes(false);
    setDateChecks({});
    setDateCheckMessage("");
  }

  function retryDateChecks() {
    setDateChecks({});
    setDateCheckMessage("");
    setDateCheckVersion((current) => current + 1);
  }

  function chooseService(nextServiceId: string) {
    const service = services.find((item) => item.id === nextServiceId) ?? services[0];
    setServiceId(service.id);
    setStaffId((current) =>
      current === "first" || service.staffIds.includes(current)
        ? current
        : service.staffIds[0],
    );
    resetSlotSelection();
  }

  function chooseStaff(nextStaffId: StaffChoice) {
    setStaffId(nextStaffId);
    resetSlotSelection();
  }

  function chooseDate(nextDate: string) {
    if (nextDate === date || dateChecks[nextDate] !== "available") return;
    idempotencyKey.current = null;
    setDate(nextDate);
    setTime("");
    setTimes([]);
    setError("");
    setLoadingTimes(true);
  }

  function chooseTime(nextTime: string) {
    if (nextTime === time) return;
    idempotencyKey.current = null;
    setTime(nextTime);
  }

  function next(nextStep: BookingStep) {
    stepFocusPending.current = true;
    setStep(nextStep);
    setError("");
  }

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (turnstileSiteKey && !turnstileToken) {
      setError("Dovršite sigurnosnu provjeru prije slanja rezervacije.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const requestKey = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = requestKey;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey,
        },
        body: JSON.stringify({
          serviceId,
          staffId,
          date,
          time,
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          phone: form.get("phone"),
          note: form.get("note"),
          consent: form.get("consent") === "on",
          turnstileToken,
        }),
      });
      const payload = (await response.json()) as {
        confirmed?: boolean;
        message?: string;
        error?: string;
        code?: string;
      };
      if (!response.ok || payload.confirmed !== true) {
        const failure = new Error(
          payload.error || payload.message || "Rezervaciju trenutačno nije moguće potvrditi.",
        ) as Error & { code?: string; status?: number };
        failure.code = payload.code;
        failure.status = response.status;
        throw failure;
      }
      setResult({
        confirmed: true,
        message:
          payload.message ||
          "Termin je potvrđen. Detalji su poslani na vaš e-mail.",
      });
    } catch (submissionError) {
      const failure = submissionError as Error & { code?: string; status?: number };
      if (failure.code === "SLOT_UNAVAILABLE") {
        idempotencyKey.current = null;
        setTime("");
        setTimes([]);
        setLoadingTimes(true);
        setTimesRefreshVersion((current) => current + 1);
        stepFocusPending.current = true;
        setStep(4);
      }
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId.current);
        setTurnstileToken("");
      }
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Rezervaciju trenutačno nije moguće poslati.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function printBookingDetails() {
    await document.fonts?.ready;
    window.print();
  }

  if (result) {
    return (
      <div className="booking-success" role="status">
        <div className="booking-success-inner">
          <img
            className="success-brand-logo"
            src="/brand/marinela-signature-on-light.svg"
            alt="Marinela Hair Design"
            width="564"
            height="340"
          />
          <span className="booking-success-seal" aria-hidden="true">✓</span>
          <p className="booking-overline">Termin potvrđen</p>
          <h3>Vidimo se u salonu.</h3>
          <p>{result.message}</p>
          <div className="booking-success-details">
            <span><small>Usluga</small><strong>{selectedService.name}</strong></span>
            <span><small>Stručnjak</small><strong>{selectedTeamMember?.name ?? "Prvi slobodan stručnjak"}</strong></span>
            <span><small>Termin</small><strong>{date.split("-").reverse().join(".")} · {time}</strong></span>
          </div>
          <button type="button" className="gold-button" onClick={printBookingDetails}>
            Spremi detalje
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-shell">
      <aside className="booking-summary">
        <div>
          <p className="booking-overline">Vaš odabir</p>
          <h3>Termin po vašoj mjeri.</h3>
        </div>
        <dl>
          <div>
            <dt>Usluga</dt>
            <dd>{selectedService.name}</dd>
          </div>
          <div>
            <dt>Trajanje</dt>
            <dd>{selectedService.durationLabel}</dd>
          </div>
          <div>
            <dt>Stručnjak</dt>
            <dd>{selectedTeamMember?.name ?? "Prvi slobodan"}</dd>
          </div>
          <div>
            <dt>Termin</dt>
            <dd>{date && time ? `${date.split("-").reverse().join(".")} · ${time}` : "Odaberite"}</dd>
          </div>
        </dl>
        <p className="booking-small">
          Plaćanje se obavlja u salonu. Za usluge s cijenom na upit konačna se cijena
          određuje nakon konzultacije.
        </p>
      </aside>

      <div className="booking-panel" ref={bookingPanel}>
        <ol className="booking-progress" aria-label="Koraci rezervacije">
          {stepNames.map((name, index) => (
            <li key={name} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}>
              <button
                type="button"
                aria-current={step === index + 1 ? "step" : undefined}
                disabled={step <= index + 1}
                onClick={() => next((index + 1) as BookingStep)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {name}
              </button>
            </li>
          ))}
        </ol>

        {error && (
          <p className="booking-error booking-shared-error" role="alert">
            {error} Možete nas nazvati na <a href="tel:+385955565738">095 556 5738</a>.
          </p>
        )}

        {step === 1 && (
          <div className="booking-step">
            <div className="booking-step-heading">
              <p>Korak 01</p>
              <h3 tabIndex={-1}>Koju uslugu želite?</h3>
            </div>
            <div className="service-choice-grid">
              {services.map((service) => (
                <button
                  type="button"
                  key={service.id}
                  className={serviceId === service.id ? "selected" : ""}
                  aria-pressed={serviceId === service.id}
                  onClick={() => chooseService(service.id)}
                >
                  <span>{service.category}</span>
                  <strong>{service.name}</strong>
                  <small>{service.durationLabel} · {service.price}</small>
                </button>
              ))}
            </div>
            <div className="booking-actions">
              <span />
              <button type="button" className="gold-button" onClick={() => next(2)}>
                Nastavi
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="booking-step">
            <div className="booking-step-heading">
              <p>Korak 02</p>
              <h3 tabIndex={-1}>Odaberite stručnjaka.</h3>
            </div>
            <div className="staff-choice-grid">
              {allowedTeam.length > 1 && (
                <button
                  type="button"
                  className={staffId === "first" ? "selected" : ""}
                  aria-pressed={staffId === "first"}
                  onClick={() => chooseStaff("first")}
                >
                  <span className="staff-initials">✦</span>
                  <strong>Prvi slobodan termin</strong>
                  <small>Najraniji dostupan termin u salonu</small>
                </button>
              )}
              {allowedTeam.map((member) => (
                <button
                  type="button"
                  key={member.id}
                  className={staffId === member.id ? "selected" : ""}
                  aria-pressed={staffId === member.id}
                  onClick={() => chooseStaff(member.id)}
                >
                  <span className="staff-initials">{member.initials}</span>
                  <strong>{member.name}</strong>
                  <small>{member.role}</small>
                </button>
              ))}
            </div>
            <div className="booking-actions">
              <button type="button" className="back-button" onClick={() => next(1)}>Natrag</button>
              <button type="button" className="gold-button" onClick={() => next(3)}>Nastavi</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="booking-step">
            <div className="booking-step-heading">
              <p>Korak 03</p>
              <h3 tabIndex={-1}>Odaberite datum.</h3>
            </div>
            <div className="date-choice-grid">
              {dates.map((item) => {
                const status = dateChecks[item.iso] ?? "checking";
                const statusLabel = status === "available"
                  ? "Slobodno"
                  : status === "full"
                    ? "Popunjeno"
                    : status === "error"
                      ? "Ponovi"
                      : "Provjera";
                return (
                  <button
                    type="button"
                    key={item.iso}
                    aria-label={`${item.day} ${item.date}. ${item.month} — ${statusLabel}`}
                    aria-pressed={date === item.iso}
                    className={`${date === item.iso ? "selected " : ""}date-${status}`}
                    disabled={status !== "available"}
                    onClick={() => chooseDate(item.iso)}
                  >
                    <span>{item.day}</span>
                    <strong>{item.date}</strong>
                    <small>{item.month}</small>
                    <em className="date-status">{statusLabel}</em>
                  </button>
                );
              })}
            </div>
            {hasDateCheckErrors && (
              <div className="date-check-message" role="status">
                <span>{dateCheckMessage || "Neke datume trenutačno nije moguće pouzdano provjeriti."}</span>
                <button type="button" onClick={retryDateChecks}>
                  Provjeri ponovno
                </button>
              </div>
            )}
            {!dateChecksPending && !hasDateCheckErrors && !hasAvailableDates && (
              <div className="date-check-message" role="status">
                Svi prikazani datumi trenutačno su popunjeni.
              </div>
            )}
            <div className="booking-actions">
              <button type="button" className="back-button" onClick={() => next(2)}>Natrag</button>
              <button type="button" className="gold-button" disabled={!date} onClick={() => next(4)}>Nastavi</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="booking-step">
            <div className="booking-step-heading">
              <p>Korak 04</p>
              <h3 tabIndex={-1}>Odaberite vrijeme.</h3>
            </div>
            {loadingTimes ? (
              <div className="times-loading" role="status">Provjeravamo raspoloživost…</div>
            ) : times.length ? (
              <div className="time-choice-grid">
                {times.map((slot) => (
                  <button
                    type="button"
                    key={slot}
                    className={time === slot ? "selected" : ""}
                    aria-pressed={time === slot}
                    onClick={() => chooseTime(slot)}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            ) : !error ? (
              <div className="times-empty" role="status">Za ovaj datum nema dostupnih termina.</div>
            ) : null}
            <div className="booking-actions">
              <button type="button" className="back-button" onClick={() => next(3)}>Natrag</button>
              <button type="button" className="gold-button" disabled={!time} onClick={() => next(5)}>Nastavi</button>
            </div>
          </div>
        )}

        {step === 5 && (
          <form
            className="booking-step booking-form"
            onSubmit={submitBooking}
            onChange={() => {
              if (!submitting) idempotencyKey.current = null;
            }}
          >
            {agentPrepared && (
              <div className="agent-prepared-notice" role="status">
                <span aria-hidden="true">✦</span>
                <p>
                  <strong>AI concierge pripremio je vaš odabir.</strong>
                  Termin još nije rezerviran. Provjerite sažetak, unesite svoje podatke i
                  osobno potvrdite rezervaciju.
                </p>
              </div>
            )}
            <div className="booking-step-heading">
              <p>Korak 05</p>
              <h3 tabIndex={-1}>Još samo vaši podaci.</h3>
            </div>
            <div className="form-grid">
              <label>
                Ime
                <input name="firstName" autoComplete="given-name" maxLength={80} required />
              </label>
              <label>
                Prezime
                <input name="lastName" autoComplete="family-name" maxLength={80} required />
              </label>
              <label>
                E-mail
                <input name="email" type="email" autoComplete="email" maxLength={160} required />
              </label>
              <label>
                Mobitel
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={40}
                  pattern={"(?:\\D*\\d){8,}\\D*"}
                  aria-describedby="booking-phone-hint"
                  required
                />
                <small id="booking-phone-hint">Najmanje 8 znamenki.</small>
              </label>
              <label className="full-field">
                Napomena <span>(nije obavezno)</span>
                <textarea name="note" rows={3} maxLength={1000} />
              </label>
            </div>
            <label className="consent-field">
              <input name="consent" type="checkbox" required />
              <span>
                Pročitao/la sam <a href="/privatnost" target="_blank" rel="noreferrer">Politiku privatnosti (otvara se u novoj kartici)</a> i
                razumijem da su navedeni podaci potrebni za obradu rezervacije.
              </span>
            </label>
            {turnstileSiteKey && (
              <div className="booking-turnstile" ref={turnstileContainer} aria-label="Sigurnosna provjera" />
            )}
            <div className="booking-actions">
              <button type="button" className="back-button" onClick={() => next(4)}>Natrag</button>
              <button type="submit" className="gold-button" disabled={submitting}>
                {submitting ? "Šaljemo…" : "Potvrdi rezervaciju"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
