"use client";

import { useState } from "react";
import type { OpeningHourSetting } from "../../lib/salon-settings";

export default function OpeningHoursManager({ initialHours }: { initialHours: OpeningHourSetting[] }) {
  const [hours, setHours] = useState(initialHours);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(dayOfWeek: number, patch: Partial<OpeningHourSetting>) {
    setHours((current) => current.map((entry) => entry.dayOfWeek === dayOfWeek ? { ...entry, ...patch } : entry));
    setMessage("");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/opening-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Radno vrijeme nije moguće spremiti.");
      setMessage("Radno vrijeme je spremljeno i odmah primijenjeno na nove rezervacije.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Radno vrijeme nije moguće spremiti.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="opening-hours-admin">
      <div className="opening-hours-intro">
        <div><p>Tjedni raspored</p><h2>Vrijeme dostupno klijentima.</h2></div>
        <p>Promjena se automatski primjenjuje na javni prikaz i na ponuđene termine u online rezervaciji.</p>
      </div>
      <div className="opening-hours-editor">
        {hours.map((entry) => (
          <article className={entry.closed ? "closed" : undefined} key={entry.dayOfWeek}>
            <div className="opening-day"><small>{entry.dayOfWeek === 0 ? "07" : String(entry.dayOfWeek).padStart(2, "0")}</small><strong>{entry.dayLabel}</strong></div>
            <label className="hours-toggle">
              <input
                type="checkbox"
                aria-label={`${entry.dayLabel}: ${entry.closed ? "otvori radni dan" : "zatvori radni dan"}`}
                checked={!entry.closed}
                onChange={(event) => update(entry.dayOfWeek, { closed: !event.target.checked })}
              />
              <span>{entry.closed ? "Zatvoreno" : "Otvoreno"}</span>
            </label>
            <label className="hours-from">Od<input aria-label={`${entry.dayLabel}: početak radnog vremena`} type="time" value={entry.openTime} disabled={entry.closed} onChange={(event) => update(entry.dayOfWeek, { openTime: event.target.value })} /></label>
            <span className="hours-divider">—</span>
            <label className="hours-to">Do<input aria-label={`${entry.dayLabel}: završetak radnog vremena`} type="time" value={entry.closeTime} disabled={entry.closed} onChange={(event) => update(entry.dayOfWeek, { closeTime: event.target.value })} /></label>
            <strong className="hours-preview">{entry.closed ? "Zatvoreno" : `${entry.openTime} – ${entry.closeTime}`}</strong>
          </article>
        ))}
      </div>
      {message && <div className="admin-feedback success" role="status">{message}</div>}
      {error && <div className="admin-feedback error" role="alert">{error}</div>}
      <div className="opening-hours-save">
        <span>Vremenska zona: Europe/Zagreb</span>
        <button className="gold-button" type="button" disabled={saving} onClick={save}>{saving ? "Spremanje…" : "Spremi radno vrijeme"}</button>
      </div>
    </section>
  );
}
