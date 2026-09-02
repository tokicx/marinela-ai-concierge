import type { Metadata } from "next";
import { canManageUsers, requireSalonPageUser } from "../../../../lib/admin-auth";
import { loadPriceList } from "../../../../lib/price-list";
import { SALON_ADDRESS, SALON_PHONE } from "../../../../lib/site";
import type {
  ManagedPriceListItem,
  ManagedPriceListSection,
} from "../../../price-list-data";
import AccessDenied from "../../access-denied";
import PrintToolbar from "./print-toolbar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A4 cjenik za ispis",
};

function displayPhone(phone: string) {
  return phone === "+385955565738" ? "095 556 5738" : phone;
}

function SinglePrice({ item, columnCount }: { item: ManagedPriceListItem; columnCount: number }) {
  const pricedCell = item.cells.find((cell) => cell.value);
  return (
    <td className="price-print-single" colSpan={columnCount}>
      <strong>{pricedCell?.value || "Na upit"}</strong>
      {pricedCell?.note && <small>{pricedCell.note}</small>}
    </td>
  );
}

function PrintableTable({
  sectionTitle,
  table,
  items,
  continuation = false,
}: {
  sectionTitle: string;
  table: ManagedPriceListSection["tables"][number];
  items: ManagedPriceListItem[];
  continuation?: boolean;
}) {
  return (
    <div className="price-print-table-block">
      {table.title && (
        <h3>{table.title}{continuation ? " · nastavak" : ""}</h3>
      )}
      <table className={table.columns.length === 1 ? "price-print-single-column-table" : undefined}>
        <caption className="visually-hidden">
          {sectionTitle}{table.title ? ` — ${table.title}` : ""}{continuation ? " — nastavak" : ""}
        </caption>
        <thead>
          <tr>
            <th scope="col">Usluga</th>
            {table.columns.map((column) => <th scope="col" key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const pricedCells = item.cells.filter((cell) => cell.value);
            return (
              <tr className={item.tone === "subtle" ? "subtle" : undefined} key={item.id}>
                <th scope="row">
                  <strong>{item.name}</strong>
                  {item.note && <small>{item.note}</small>}
                </th>
                {pricedCells.length <= 1 ? (
                  <SinglePrice item={item} columnCount={table.columns.length} />
                ) : table.columns.map((column, cellIndex) => {
                    const cell = item.cells[cellIndex];
                    return (
                      <td key={`${item.id}-${column}`}>
                        <strong>{cell?.value || "—"}</strong>
                        {cell?.note && <small>{cell.note}</small>}
                      </td>
                    );
                  })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PrintableSection({
  section,
  sectionIndex,
  splitTables = false,
  splitRows = false,
}: {
  section: ManagedPriceListSection;
  sectionIndex: number;
  splitTables?: boolean;
  splitRows?: boolean;
}) {
  const rowSplitTable = splitRows && section.tables.length === 1 ? section.tables[0] : null;
  const rowSplitAt = rowSplitTable ? Math.ceil(rowSplitTable.items.length / 2) : 0;

  return (
    <section className={`price-print-section${splitTables ? " split-tables" : ""}${rowSplitTable ? " split-rows" : ""}`}>
      <header>
        <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
        <div>
          <p>{section.kicker}</p>
          <h2>{section.title}</h2>
        </div>
        <small>Sredstvo plaćanja: <strong>Gotovina</strong></small>
      </header>
      <div className="price-print-tables">
        {rowSplitTable ? (
          <>
            <PrintableTable
              sectionTitle={section.title}
              table={rowSplitTable}
              items={rowSplitTable.items.slice(0, rowSplitAt)}
            />
            <PrintableTable
              sectionTitle={section.title}
              table={rowSplitTable}
              items={rowSplitTable.items.slice(rowSplitAt)}
              continuation
            />
          </>
        ) : section.tables.map((table) => (
          <PrintableTable
            key={table.id}
            sectionTitle={section.title}
            table={table}
            items={table.items}
          />
        ))}
      </div>
    </section>
  );
}

export default async function PrintablePriceListPage() {
  const user = await requireSalonPageUser("/admin/cjenik/ispis");
  if (!user || !canManageUsers(user)) return <AccessDenied />;

  const loadedSections = await loadPriceList();
  const sections = loadedSections
    .map((section) => ({
      ...section,
      tables: section.tables.filter((table) => table.items.length > 0),
    }))
    .filter((section) => section.tables.length > 0);
  const generatedLabel = new Intl.DateTimeFormat("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Zagreb",
  }).format(new Date());
  const itemCount = sections.reduce(
    (total, section) => total + section.tables.reduce((sum, table) => sum + table.items.length, 0),
    0,
  );
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const coloringSection = sectionById.get("bojanja");
  const cuttingSection = sectionById.get("sisanja");
  const stylingSection = sectionById.get("oblikovanje-kose");
  const highlightsSection = sectionById.get("pramenovi-dekoloracije");
  const remainingSections = sections.filter((section) => ![
    "bojanja",
    "sisanja",
    "oblikovanje-kose",
    "pramenovi-dekoloracije",
  ].includes(section.id));
  const densityClass = itemCount > 54 ? " is-ultra-dense" : itemCount > 48 ? " is-dense" : "";

  return (
    <main className="price-print-route">
      <PrintToolbar sheetId="price-print-sheet" />
      <div className="price-print-document">
        <article
          id="price-print-sheet"
          aria-label="Cjeloviti cjenik usluga — jedna A4 stranica"
          className={`price-print-sheet${densityClass}`}
          data-print-fit="checking"
        >
          <div className="price-print-overflow-warning" role="alert">
            Cjenik trenutačno ne stane sigurno na jedan A4 list. Vratite se u dashboard,
            uklonite dodatnu stavku ili skratite tekst, zatim ponovno otvorite izvoz.
          </div>
          <img
            aria-hidden="true"
            className="price-print-watermark"
            src="/brand/marinela-crest-on-light.svg"
            alt=""
            width="224"
            height="212"
          />

          <header className="price-print-header">
            <span className="price-print-index">Cjenik</span>
            <img
              className="price-print-logo"
              src="/brand/marinela-signature-on-light.svg"
              alt="Marinela Hair Design"
              width="564"
              height="340"
            />
            <div className="price-print-edition">
              <span>A4 · jedan list</span>
              <small>Ažurirano {generatedLabel}</small>
            </div>
          </header>

          <div className="price-print-title-row">
            <div>
              <p>Transparentno · detaljno · po mjeri</p>
              <h1>Cjenik usluga</h1>
            </div>
            <div className="price-print-summary">
              <span>{itemCount}</span>
              <small>aktivnih stavki</small>
            </div>
            <div className="price-print-payment" role="note" aria-label="Sredstvo plaćanja: gotovina">
              <span>Sredstvo plaćanja</span>
              <strong>Gotovina</strong>
            </div>
          </div>

          <div className="price-print-catalog">
            {coloringSection && (
              <PrintableSection section={coloringSection} sectionIndex={0} splitRows />
            )}
            <div className="price-print-mid-grid">
              {cuttingSection && (
                <PrintableSection section={cuttingSection} sectionIndex={1} />
              )}
              {stylingSection && (
                <PrintableSection section={stylingSection} sectionIndex={2} />
              )}
            </div>
            {highlightsSection && (
              <PrintableSection section={highlightsSection} sectionIndex={3} splitRows />
            )}
            {remainingSections.map((section) => (
              <PrintableSection
                key={section.id}
                section={section}
                sectionIndex={sections.findIndex((candidate) => candidate.id === section.id)}
                splitTables
              />
            ))}
          </div>

          <footer className="price-print-footer">
            <div>
              <strong>{SALON_ADDRESS.streetAddress}</strong>
              <span>{SALON_ADDRESS.postalCode} {SALON_ADDRESS.addressLocality}</span>
            </div>
            <p>
              Sve cijene izražene su u eurima. Konačna cijena može ovisiti o utrošku
              materijala, gustoći, stanju kose i željenom rezultatu.
            </p>
            <div>
              <strong>{displayPhone(SALON_PHONE)}</strong>
              <span>@marinelahairdesign</span>
            </div>
            <b>1 / 1</b>
          </footer>
        </article>
      </div>
    </main>
  );
}
