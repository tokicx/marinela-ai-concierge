"use client";

import { useState } from "react";
import type {
  ManagedPriceListItem,
  ManagedPriceListSection,
} from "../price-list-data";

type Feedback = {
  itemId: string;
  type: "success" | "error";
  message: string;
};

type ApiResult = {
  error?: string;
  item?: ManagedPriceListItem;
  prices?: string[];
};

const NEW_ITEM_ID = "new-price-list-item";

export default function PriceListManager({ sections }: { sections: ManagedPriceListSection[] }) {
  const firstTableId = sections[0]?.tables[0]?.id ?? "";
  const firstColumnCount = sections[0]?.tables[0]?.columns.length ?? 0;
  const [catalog, setCatalog] = useState(sections);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [pendingActiveChange, setPendingActiveChange] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [selectedTableId, setSelectedTableId] = useState(firstTableId);
  const [newItemName, setNewItemName] = useState("");
  const [newItemNote, setNewItemNote] = useState("");
  const [newPrices, setNewPrices] = useState<string[]>(() => Array(firstColumnCount).fill(""));
  const [adding, setAdding] = useState(false);

  const tableOptions = catalog.flatMap((section) => section.tables.map((table) => ({
    id: table.id,
    label: table.title ? `${section.title} · ${table.title}` : section.title,
    columns: table.columns,
  })));
  const selectedTable = tableOptions.find((table) => table.id === selectedTableId) ?? tableOptions[0];

  function updateCatalogItem(
    itemId: string,
    update: (item: ManagedPriceListItem) => ManagedPriceListItem,
  ) {
    setCatalog((current) => current.map((section) => ({
      ...section,
      tables: section.tables.map((table) => ({
        ...table,
        items: table.items.map((item) => item.id === itemId ? update(item) : item),
      })),
    })));
  }

  async function parseApiResult(response: Response): Promise<ApiResult> {
    try {
      return await response.json() as ApiResult;
    } catch {
      return {};
    }
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTable) return;

    const name = newItemName.trim();
    if (!name) {
      setFeedback({ itemId: NEW_ITEM_ID, type: "error", message: "Upišite naziv nove stavke." });
      return;
    }

    setAdding(true);
    setBusyItemId(NEW_ITEM_ID);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/price-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: selectedTable.id,
          name,
          note: newItemNote.trim(),
          prices: newPrices.map((price) => price.trim()),
        }),
      });
      const result = await parseApiResult(response);
      if (!response.ok) throw new Error(result.error || "Stavku nije moguće dodati.");

      if (result.item) {
        setCatalog((current) => current.map((section) => ({
          ...section,
          tables: section.tables.map((table) => table.id === selectedTable.id
            ? { ...table, items: [...table.items, result.item as ManagedPriceListItem] }
            : table),
        })));
      }
      setNewItemName("");
      setNewItemNote("");
      setNewPrices(Array(selectedTable.columns.length).fill(""));
      setFeedback({ itemId: NEW_ITEM_ID, type: "success", message: "Nova stavka dodana je u cjenik." });

      // The API may return only a success marker. Reload in that case so the new
      // database row is rendered with its canonical identifier and ordering.
      if (!result.item) window.location.reload();
    } catch (error) {
      setFeedback({
        itemId: NEW_ITEM_ID,
        type: "error",
        message: error instanceof Error ? error.message : "Stavku nije moguće dodati.",
      });
    } finally {
      setAdding(false);
      setBusyItemId(null);
    }
  }

  async function saveItem(event: React.FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = catalog
      .flatMap((section) => section.tables)
      .flatMap((table) => table.items)
      .find((candidate) => candidate.id === itemId);
    if (!item || !item.active) return;

    const prices = item.cells.map((_, index) => String(form.get(`price-${index}`) ?? "").trim());
    setBusyItemId(itemId);
    setPendingActiveChange(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/price-list/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices }),
      });
      const result = await parseApiResult(response);
      if (!response.ok || !result.prices) throw new Error(result.error || "Cijene nije moguće spremiti.");
      updateCatalogItem(itemId, (candidate) => ({
        ...candidate,
        cells: candidate.cells.map((cell, index) => ({
          ...cell,
          value: result.prices?.[index] ?? cell.value,
        })),
      }));
      setFeedback({ itemId, type: "success", message: "Cijena je spremljena i odmah je vidljiva na webu." });
    } catch (error) {
      setFeedback({
        itemId,
        type: "error",
        message: error instanceof Error ? error.message : "Cijene nije moguće spremiti.",
      });
    } finally {
      setBusyItemId(null);
    }
  }

  async function removeItem(itemId: string) {
    if (pendingActiveChange !== itemId) {
      setPendingActiveChange(itemId);
      setFeedback({
        itemId,
        type: "error",
        message: "Stavka će nestati s javnog cjenika. Kliknite „Potvrdi uklanjanje” za nastavak.",
      });
      return;
    }

    setBusyItemId(itemId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/price-list/${encodeURIComponent(itemId)}`, {
        method: "DELETE",
      });
      const result = await parseApiResult(response);
      if (!response.ok) throw new Error(result.error || "Stavku nije moguće ukloniti.");
      updateCatalogItem(itemId, (item) => ({ ...item, active: false }));
      setPendingActiveChange(null);
      setFeedback({
        itemId,
        type: "success",
        message: "Stavka je uklonjena s javnog cjenika. Možete je vratiti u bilo kojem trenutku.",
      });
    } catch (error) {
      setFeedback({
        itemId,
        type: "error",
        message: error instanceof Error ? error.message : "Stavku nije moguće ukloniti.",
      });
    } finally {
      setBusyItemId(null);
    }
  }

  async function restoreItem(itemId: string) {
    setBusyItemId(itemId);
    setPendingActiveChange(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/price-list/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      const result = await parseApiResult(response);
      if (!response.ok) throw new Error(result.error || "Stavku nije moguće vratiti.");
      updateCatalogItem(itemId, (item) => ({ ...item, active: true }));
      setFeedback({ itemId, type: "success", message: "Stavka je ponovno vidljiva na javnom cjeniku." });
    } catch (error) {
      setFeedback({
        itemId,
        type: "error",
        message: error instanceof Error ? error.message : "Stavku nije moguće vratiti.",
      });
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <section className="price-admin-shell">
      <div className="price-admin-intro">
        <div>
          <p>Upravljanje cjenikom</p>
          <h2>Jedno mjesto.<br />Sve cijene.</h2>
        </div>
        <p>
          Dodajte novu stavku ili uredite postojeću. Upišite puni prikaz cijene,
          primjerice <strong>50,00 €</strong> ili <strong>od 50,00 €</strong>. Uklonjene
          stavke ostaju spremljene i možete ih naknadno vratiti. Za jedinstvenu
          cijenu ispunite samo prvo polje. Radi čitljivog ispisa na jednom A4 listu
          svaka tablica može imati jednu dodatnu aktivnu stavku.
        </p>
      </div>

      <form className="price-admin-add" onSubmit={addItem}>
        <div className="price-admin-add-heading">
          <p>Nova stavka</p>
          <h3>Dodaj u cjenik</h3>
        </div>
        <div className="price-admin-add-fields">
          <label>
            Kategorija
            <select
              value={selectedTable?.id ?? ""}
              disabled={adding || tableOptions.length === 0}
              onChange={(event) => {
                const tableId = event.target.value;
                const table = tableOptions.find((candidate) => candidate.id === tableId);
                setSelectedTableId(tableId);
                setNewPrices(Array(table?.columns.length ?? 0).fill(""));
              }}
            >
              {tableOptions.map((table) => <option key={table.id} value={table.id}>{table.label}</option>)}
            </select>
          </label>
          <label>
            Naziv usluge
            <input
              value={newItemName}
              onChange={(event) => setNewItemName(event.target.value)}
              maxLength={64}
              required
              disabled={adding}
              placeholder="Primjer: Svečana frizura"
            />
          </label>
          <label>
            Napomena <small>(nije obavezno)</small>
            <input
              value={newItemNote}
              onChange={(event) => setNewItemNote(event.target.value)}
              maxLength={80}
              disabled={adding}
              placeholder="Primjer: S uključenim pranjem"
            />
          </label>
        </div>
        {selectedTable && (
          <div className="price-admin-inputs price-admin-add-prices">
            {selectedTable.columns.map((column, index) => (
              <label key={`${selectedTable.id}-${column}`}>
                {column}
                <input
                  value={newPrices[index] ?? ""}
                  onChange={(event) => setNewPrices((current) => current.map((price, priceIndex) => (
                    priceIndex === index ? event.target.value : price
                  )))}
                  maxLength={30}
                  disabled={adding}
                  aria-label={`Nova stavka — ${column}`}
                  placeholder="0,00 €"
                />
              </label>
            ))}
          </div>
        )}
        <button type="submit" disabled={adding || !selectedTable}>
          {adding ? "Dodajem…" : "Dodaj stavku"}
        </button>
        {feedback?.itemId === NEW_ITEM_ID && (
          <p className={`price-admin-feedback ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
            {feedback.message}
          </p>
        )}
      </form>

      <div className="price-admin-sections">
        {catalog.map((section, sectionIndex) => {
          const itemCount = section.tables.reduce((sum, table) => sum + table.items.length, 0);
          const inactiveCount = section.tables.reduce(
            (sum, table) => sum + table.items.filter((item) => !item.active).length,
            0,
          );
          return (
            <details open={sectionIndex === 0 ? true : undefined} key={section.id}>
              <summary>
                <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
                <strong>{section.title}</strong>
                <small>
                  {itemCount} stavki{inactiveCount > 0 ? ` · ${inactiveCount} uklonjeno` : ""}
                </small>
              </summary>
              <div className="price-admin-section-body">
                {section.tables.map((table) => (
                  <div className="price-admin-table" key={table.id}>
                    {table.title && <h3>{table.title}</h3>}
                    {table.items.map((item) => (
                      <form
                        className={`price-admin-row${item.active ? "" : " is-inactive"}${item.custom ? " is-custom" : ""}`}
                        key={item.id}
                        onSubmit={(event) => saveItem(event, item.id)}
                      >
                        <div className="price-admin-identity">
                          <strong>{item.name}</strong>
                          {item.note && <small>{item.note}</small>}
                          <div className="price-admin-badges">
                            {item.custom && <small>Dodano ručno</small>}
                            {!item.active && <small>Uklonjeno s weba</small>}
                          </div>
                        </div>
                        <div className="price-admin-inputs">
                          {item.cells.map((cell, cellIndex) => (
                            <label key={`${item.id}-${table.columns[cellIndex]}`}>
                              {table.columns[cellIndex]}
                              <input
                                name={`price-${cellIndex}`}
                                defaultValue={cell.value}
                                maxLength={30}
                                disabled={!item.active || busyItemId !== null}
                                aria-label={`${item.name} — ${table.columns[cellIndex]}`}
                              />
                              {cell.note && <small>{cell.note}</small>}
                            </label>
                          ))}
                        </div>
                        <div className="price-admin-actions">
                          {item.active ? (
                            <>
                              <button type="submit" disabled={busyItemId !== null}>
                                {busyItemId === item.id ? "Spremam…" : "Spremi"}
                              </button>
                              <button
                                className={`price-admin-danger${pendingActiveChange === item.id ? " confirm" : ""}`}
                                type="button"
                                disabled={busyItemId !== null}
                                onClick={() => removeItem(item.id)}
                              >
                                {busyItemId === item.id
                                  ? "Uklanjam…"
                                  : pendingActiveChange === item.id
                                    ? "Potvrdi uklanjanje"
                                    : "Ukloni"}
                              </button>
                              {pendingActiveChange === item.id && (
                                <button
                                  className="price-admin-cancel"
                                  type="button"
                                  disabled={busyItemId !== null}
                                  onClick={() => {
                                    setPendingActiveChange(null);
                                    setFeedback(null);
                                  }}
                                >
                                  Odustani
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              className="price-admin-restore"
                              type="button"
                              disabled={busyItemId !== null}
                              onClick={() => restoreItem(item.id)}
                            >
                              {busyItemId === item.id ? "Vraćam…" : "Vrati na web"}
                            </button>
                          )}
                        </div>
                        {feedback?.itemId === item.id && (
                          <p className={`price-admin-feedback ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
                            {feedback.message}
                          </p>
                        )}
                      </form>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
