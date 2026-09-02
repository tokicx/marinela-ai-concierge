"use client";

import { useEffect, useRef, useState } from "react";
import type { ManagedPriceListSection } from "../price-list-data";

function PriceSectionPanel({
  section,
  sectionIndex,
  hidden,
}: {
  section: ManagedPriceListSection;
  sectionIndex: number;
  hidden: boolean;
}) {
  return (
    <article
      aria-labelledby={`price-tab-${section.id}`}
      className="price-category price-category-panel"
      hidden={hidden}
      id={`price-panel-${section.id}`}
      role="tabpanel"
      tabIndex={hidden ? -1 : 0}
    >
      <header className="price-category-heading">
        <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
        <div>
          <p>{section.kicker}</p>
          <h2>{section.title}</h2>
          <div
            aria-label="Sredstvo plaćanja: gotovina"
            className="price-payment-note"
            role="note"
          >
            <span>Sredstvo plaćanja</span>
            <strong>Gotovina</strong>
          </div>
        </div>
      </header>

      <div className="price-category-content">
        {section.tables.map((table) => (
          <div className="price-table-block" key={table.id}>
            {table.title && <h3>{table.title}</h3>}
            <div
              aria-label={section.title + (table.title ? " — " + table.title : "")}
              className="price-table-wrap"
              role="region"
              tabIndex={0}
            >
              <table className="price-table" role="table">
                <caption className="visually-hidden">
                  {section.title}{table.title ? ` — ${table.title}` : ""}
                </caption>
                <thead role="rowgroup">
                  <tr role="row">
                    <th id={table.id + "-service-header"} role="columnheader" scope="col">Usluga</th>
                    {table.columns.map((column, columnIndex) => (
                      <th
                        id={table.id + "-column-" + columnIndex}
                        key={column}
                        role="columnheader"
                        scope="col"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {table.items.map((item) => (
                    <tr className={item.tone === "subtle" ? "subtle" : undefined} key={item.id} role="row">
                      <th id={table.id + "-row-" + item.id} role="rowheader" scope="row">
                        <strong>{item.name}</strong>
                        {item.note && <small>{item.note}</small>}
                      </th>
                      {item.cells[0]?.value && item.cells.filter((cell) => cell.value).length === 1 ? (
                        <td
                          aria-label={"Cijena: " + item.cells[0].value}
                          className="price-single-value"
                          colSpan={table.columns.length}
                          data-label="Cijena"
                          headers={table.id + "-row-" + item.id}
                          role="cell"
                        >
                          <span aria-hidden="true" className="price-cell-label">Cijena</span>
                          <span
                            className="price-single-grid"
                            style={{ gridTemplateColumns: "repeat(" + table.columns.length + ", minmax(0, 1fr))" }}
                          >
                            <span className="price-single-slot">
                              <span>{item.cells[0].value}</span>
                              {item.cells[0].note && <small>{item.cells[0].note}</small>}
                            </span>
                          </span>
                        </td>
                      ) : table.columns.map((column, cellIndex) => {
                          const cell = item.cells[cellIndex];
                          const hasValue = Boolean(cell?.value);
                          return (
                            <td
                              className={hasValue ? undefined : "price-empty-cell"}
                              data-label={column}
                              headers={table.id + "-row-" + item.id + " " + table.id + "-column-" + cellIndex}
                              key={item.id + "-" + column}
                              role="cell"
                            >
                              <span aria-hidden="true" className="price-cell-label">{column}</span>
                              <span className="price-cell-value">{cell?.value || "—"}</span>
                              {cell?.note && <small>{cell.note}</small>}
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function PriceListTabs({ sections }: { sections: ManagedPriceListSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const catalogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selectFromHash = () => {
      const requestedId = window.location.hash.slice(1);
      if (sections.some((section) => section.id === requestedId)) {
        setActiveId(requestedId);
        window.requestAnimationFrame(() => catalogRef.current?.scrollIntoView({ block: "start" }));
      }
    };
    selectFromHash();
    window.addEventListener("hashchange", selectFromHash);
    return () => window.removeEventListener("hashchange", selectFromHash);
  }, [sections]);

  const activeIndex = Math.max(0, sections.findIndex((section) => section.id === activeId));
  if (!sections[activeIndex]) return null;

  function selectTab(sectionId: string, button?: HTMLButtonElement) {
    setActiveId(sectionId);
    window.history.replaceState(null, "", `#${sectionId}`);
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    catalogRef.current?.scrollIntoView({ block: "start" });
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % sections.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + sections.length) % sections.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = sections.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextSection = sections[nextIndex];
    const nextButton = document.getElementById(`price-tab-${nextSection.id}`) as HTMLButtonElement | null;
    selectTab(nextSection.id, nextButton ?? undefined);
    nextButton?.focus();
  }

  return (
    <section className="price-tabs" aria-label="Cjenik po kategorijama">
      <div className="price-category-nav" role="tablist" aria-label="Kategorije cjenika">
        {sections.map((section, index) => {
          const selected = index === activeIndex;
          return (
            <button
              aria-controls={`price-panel-${section.id}`}
              aria-selected={selected}
              id={`price-tab-${section.id}`}
              key={section.id}
              onClick={(event) => selectTab(section.id, event.currentTarget)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {section.title}
            </button>
          );
        })}
      </div>

      <div className="price-list-catalog" ref={catalogRef}>
        {sections.map((section, index) => (
          <PriceSectionPanel
            hidden={index !== activeIndex}
            key={section.id}
            section={section}
            sectionIndex={index}
          />
        ))}
      </div>
    </section>
  );
}
