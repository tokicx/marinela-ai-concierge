"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { bookingWindowEndDate, salonDateString } from "../../lib/time";

export default function BookingActions({
  bookingId,
  status,
  canDelete,
  currentDate,
}: {
  bookingId: string;
  status: string;
  canDelete: boolean;
  currentDate: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "reschedule" | "cancel" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(currentDate);
  const [time, setTime] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const availabilityRequest = useRef<AbortController | null>(null);
  const reschedulePanel = useRef<HTMLDivElement>(null);
  const rescheduleToggle = useRef<HTMLButtonElement>(null);
  const bookingDateMin = salonDateString();
  const bookingDateMax = bookingWindowEndDate();

  useEffect(() => {
    return () => availabilityRequest.current?.abort();
  }, []);

  function loadTimes(nextDate: string) {
    availabilityRequest.current?.abort();
    if (!nextDate) {
      setTimes([]);
      setTime("");
      return;
    }
    const controller = new AbortController();
    availabilityRequest.current = controller;
    setLoadingTimes(true);
    setTime("");
    fetch(
      `/api/admin/bookings/${encodeURIComponent(bookingId)}?date=${encodeURIComponent(nextDate)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = await response.json() as { times?: string[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Termine trenutačno nije moguće učitati.");
        setTimes(Array.isArray(payload.times) ? payload.times : []);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTimes([]);
        setMessage(error instanceof Error ? error.message : "Termine trenutačno nije moguće učitati.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingTimes(false);
      });
  }

  async function cancel() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      setConfirmDelete(false);
      setMessage("Potvrdite otkazivanje termina. Klijent će biti obaviješten.");
      return;
    }
    setBusy("cancel");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const payload = await response.json() as {
        error?: string;
        emailAccepted?: boolean;
        calendarCancellationSent?: boolean;
      };
      if (!response.ok) throw new Error(payload.error || "Radnju nije moguće izvršiti.");
      setMessage(payload.calendarCancellationSent || payload.emailAccepted ? "Termin otkazan · klijent obaviješten." : "Termin otkazan.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Radnju nije moguće izvršiti.");
      setConfirmCancel(false);
    } finally {
      setBusy(null);
    }
  }

  async function confirmException() {
    setBusy("confirm");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      const payload = await response.json() as { error?: string; emailAccepted?: boolean };
      if (!response.ok) throw new Error(payload.error || "Termin nije moguće sigurno potvrditi.");
      setMessage(payload.emailAccepted ? "Termin potvrđen · klijent obaviješten." : "Termin je potvrđen i sinkroniziran.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Termin nije moguće sigurno potvrditi.");
    } finally {
      setBusy(null);
    }
  }

  async function reschedule() {
    if (!date || !time) {
      setMessage("Odaberite novi datum i slobodno vrijeme.");
      return;
    }
    setBusy("reschedule");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, time }),
      });
      const payload = await response.json() as {
        error?: string;
        emailAccepted?: boolean;
        reminderScheduled?: boolean;
      };
      if (!response.ok) throw new Error(payload.error || "Termin nije moguće promijeniti.");
      setMessage(
        payload.emailAccepted
          ? "Termin promijenjen · klijent obaviješten."
          : "Termin promijenjen i sinkroniziran.",
      );
      setEditing(false);
      requestAnimationFrame(() => rescheduleToggle.current?.focus());
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Termin nije moguće promijeniti.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setMessage("Potvrdite trajno uklanjanje termina iz aktivne evidencije.");
      return;
    }
    setBusy("delete");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        method: "DELETE",
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Termin nije moguće izbrisati.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Termin nije moguće izbrisati.");
      setBusy(null);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="admin-booking-actions">
      {["pending_calendar", "pending_confirmation", "needs_attention"].includes(status) && (
        <button type="button" disabled={busy !== null} onClick={confirmException}>
          {busy === "confirm" ? "Provjeravam…" : "Provjeri i potvrdi"}
        </button>
      )}
      {status === "confirmed" && (
        <button
          ref={rescheduleToggle}
          aria-expanded={editing}
          aria-controls={`reschedule-${bookingId}`}
          aria-label={`Promijeni termin ${bookingId.slice(0, 8)}`}
          type="button"
          disabled={busy !== null}
          onClick={() => {
            const nextEditing = !editing;
            setEditing(nextEditing);
            setConfirmCancel(false);
            setMessage("");
            if (nextEditing) {
              loadTimes(date);
              requestAnimationFrame(() => reschedulePanel.current?.querySelector<HTMLInputElement>("input")?.focus());
            }
          }}
        >
          Promijeni termin
        </button>
      )}
      {status !== "cancelled" && (
        <button aria-label={`${confirmCancel ? "Potvrdi otkazivanje termina" : "Otkaži termin"} ${bookingId.slice(0, 8)}`} className={confirmCancel ? "secondary confirm" : "secondary"} type="button" disabled={busy !== null} onClick={cancel}>
          {busy === "cancel" ? "Otkazujem…" : confirmCancel ? "Potvrdi otkazivanje" : "Otkaži"}
        </button>
      )}
      {editing && status === "confirmed" && (
        <div className="admin-reschedule-panel" id={`reschedule-${bookingId}`} ref={reschedulePanel}>
          <label>
            <span>Novi datum</span>
            <input type="date" min={bookingDateMin} max={bookingDateMax} value={date} disabled={busy !== null} onChange={(event) => { setDate(event.target.value); loadTimes(event.target.value); }} />
          </label>
          <label>
            <span>Slobodno vrijeme</span>
            <select value={time} disabled={busy !== null || loadingTimes} onChange={(event) => setTime(event.target.value)}>
              <option value="">{loadingTimes ? "Provjeravam…" : times.length ? "Odaberite vrijeme" : "Nema slobodnih termina"}</option>
              {times.map((availableTime) => <option key={availableTime} value={availableTime}>{availableTime}</option>)}
            </select>
          </label>
          <div>
            <button type="button" disabled={busy !== null || !time} onClick={reschedule}>
              {busy === "reschedule" ? "Spremam…" : "Spremi novi termin"}
            </button>
            <button className="secondary" type="button" disabled={busy !== null} onClick={() => {
              setEditing(false);
              setMessage("");
              requestAnimationFrame(() => rescheduleToggle.current?.focus());
            }}>
              Odustani
            </button>
          </div>
        </div>
      )}
      {confirmCancel && busy === null && (
        <button className="secondary" type="button" onClick={() => { setConfirmCancel(false); setMessage(""); }}>Odustani</button>
      )}
      {canDelete && (
        <button aria-label={`${confirmDelete ? "Potvrdi brisanje termina" : "Izbriši termin"} ${bookingId.slice(0, 8)}`} className={confirmDelete ? "danger confirm" : "danger"} type="button" disabled={busy !== null} onClick={remove}>
          {busy === "delete" ? "Brišem…" : confirmDelete ? "Potvrdi brisanje" : "Izbriši"}
        </button>
      )}
      {confirmDelete && busy === null && (
        <button className="secondary" type="button" onClick={() => { setConfirmDelete(false); setMessage(""); }}>Odustani</button>
      )}
      {status === "cancelled" && !canDelete && <span className="admin-no-actions">Nema radnji</span>}
      {message && <small role="status">{message}</small>}
    </div>
  );
}
