"use client";

import { useEffect, useRef, useState } from "react";
import type { SalonService } from "../../lib/salon-settings";

const categories: SalonService["category"][] = ["Ekstenzije", "Boja", "Styling", "Njega"];

function staffLabel(staffIds: SalonService["staffIds"]) {
  if (staffIds.length === 2) return "Marinela · Mia";
  if (staffIds[0] === "mia") return "Mia";
  if (staffIds[0] === "marinela") return "Marinela";
  return "Nije dodijeljeno";
}

export default function ServicesManager({ services }: { services: SalonService[] }) {
  const [editing, setEditing] = useState<SalonService | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyServiceId, setBusyServiceId] = useState<string | null>(null);
  const [pendingActiveChange, setPendingActiveChange] = useState<{
    serviceId: string;
    nextActive: boolean;
  } | null>(null);
  const [error, setError] = useState<{
    message: string;
    source: "form" | "list";
    serviceId?: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  async function saveService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      category: form.get("category"),
      priceLabel: form.get("priceLabel"),
      durationMinutes: Number(form.get("durationMinutes")),
      bufferMinutes: Number(form.get("bufferMinutes")),
      description: form.get("description"),
      staffIds: form.getAll("staffIds"),
    };

    try {
      const response = await fetch(
        editing ? `/api/admin/services/${encodeURIComponent(editing.id)}` : "/api/admin/services",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Uslugu nije moguće spremiti.");
      window.location.reload();
    } catch (submissionError) {
      setError({
        message: submissionError instanceof Error ? submissionError.message : "Uslugu nije moguće spremiti.",
        source: "form",
      });
      setSubmitting(false);
    }
  }

  async function setServiceActive(service: SalonService, active: boolean) {
    setError(null);
    setBusyServiceId(service.id);
    setPendingActiveChange(null);
    try {
      const response = await fetch(`/api/admin/services/${encodeURIComponent(service.id)}`, {
        method: active ? "PATCH" : "DELETE",
        headers: active ? { "Content-Type": "application/json" } : undefined,
        body: active ? JSON.stringify({ active: true }) : undefined,
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Promjenu nije moguće spremiti.");
      window.location.reload();
    } catch (changeError) {
      setError({
        message: changeError instanceof Error ? changeError.message : "Promjenu nije moguće spremiti.",
        source: "list",
        serviceId: service.id,
      });
      setBusyServiceId(null);
    }
  }

  return (
    <div className="service-admin-shell">
      <div className="service-admin-layout">
        <section className="service-admin-list">
        <div className="admin-section-title">
          <div><p>Katalog salona</p><h2>Usluge na webu</h2></div>
          <span>{services.filter((service) => service.active).length} aktivnih</span>
        </div>
        <div className="service-admin-rows">
          {services.map((service, index) => {
            const pending = pendingActiveChange?.serviceId === service.id
              && pendingActiveChange.nextActive === !service.active;
            return (
              <article className={!service.active ? "inactive" : undefined} key={service.id}>
              <span className="service-admin-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="service-admin-identity">
                <small>{service.category}</small>
                <strong>{service.name}</strong>
                <span>{staffLabel(service.staffIds)}</span>
              </div>
              <div className="service-admin-meta"><small>Trajanje</small><strong>{service.durationLabel}</strong></div>
              <div className="service-admin-meta"><small>Cijena</small><strong>{service.price}</strong></div>
              <span className={`access-state ${service.active ? "active" : "inactive"}`}>
                {service.active ? "Na webu" : "Uklonjeno"}
              </span>
              <div className="service-admin-actions">
                {service.active && (
                  <button
                    type="button"
                    aria-label={`Uredi uslugu ${service.name}`}
                    onClick={() => { setError(null); setPendingActiveChange(null); setEditing(service); }}
                  >
                    Uredi
                  </button>
                )}
                <button
                  type="button"
                  className={pending ? service.active ? "danger confirm" : "restore confirm" : service.active ? "danger" : "restore"}
                  disabled={busyServiceId !== null}
                  aria-label={`${pending ? "Potvrdi " : ""}${service.active ? "uklanjanje" : "vraćanje"} usluge ${service.name}`}
                  onClick={() => pending
                    ? setServiceActive(service, !service.active)
                    : setPendingActiveChange({ serviceId: service.id, nextActive: !service.active })}
                >
                  {busyServiceId === service.id
                    ? "Spremam…"
                    : pending
                      ? service.active ? "Potvrdi uklanjanje" : "Potvrdi vraćanje"
                      : service.active ? "Ukloni" : "Vrati"}
                </button>
                {pending && (
                  <button className="secondary" type="button" onClick={() => setPendingActiveChange(null)}>
                    Odustani
                  </button>
                )}
              </div>
              {error?.source === "list" && error.serviceId === service.id && (
                <div className="admin-feedback error service-row-feedback" role="alert">{error.message}</div>
              )}
            </article>
            );
          })}
        </div>
        </section>

        <form ref={formRef} aria-labelledby="service-form-title" className="admin-service-form" key={editing?.id ?? "new"} onSubmit={saveService}>
        <div className="admin-service-form-heading">
          <div><p>{editing ? "Uređivanje" : "Nova stavka"}</p><h2 id="service-form-title">{editing ? "Uredi uslugu" : "Dodaj uslugu"}</h2></div>
          {editing && <button type="button" onClick={() => setEditing(null)}>Nova usluga</button>}
        </div>
        <label>Naziv usluge<input name="name" defaultValue={editing?.name} required maxLength={90} /></label>
        <div className="admin-form-pair">
          <label>
            Kategorija
            <select name="category" defaultValue={editing?.category ?? "Styling"}>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label>Cijena / oznaka<input name="priceLabel" defaultValue={editing?.price ?? "Cijena na upit"} required maxLength={60} /></label>
        </div>
        <div className="admin-form-pair">
          <label>Trajanje (min)<input name="durationMinutes" type="number" min="15" max="480" step="15" defaultValue={editing?.duration ?? 60} required /></label>
          <label>Razmak nakon usluge (min)<input name="bufferMinutes" type="number" min="0" max="180" step="15" defaultValue={editing?.buffer ?? 0} required /></label>
        </div>
        <label>Opis<textarea name="description" defaultValue={editing?.description} required maxLength={420} rows={4} /></label>
        <fieldset>
          <legend>Uslugu izvodi</legend>
          <label><input name="staffIds" type="checkbox" value="marinela" defaultChecked={editing ? editing.staffIds.includes("marinela") : true} /> Marinela</label>
          <label><input name="staffIds" type="checkbox" value="mia" defaultChecked={editing ? editing.staffIds.includes("mia") : true} /> Mia</label>
        </fieldset>
        {error?.source === "form" && <div className="admin-feedback error" role="alert">{error.message}</div>}
        <button className="gold-button" type="submit" disabled={submitting}>
          {submitting ? "Spremanje…" : editing ? "Spremi promjene" : "Dodaj uslugu"}
        </button>
        <small>Promjene se odmah prikazuju u katalogu usluga i obrascu za rezervaciju. Detaljni javni cjenik uređuje se u zasebnom tabu.</small>
        </form>
      </div>
    </div>
  );
}
