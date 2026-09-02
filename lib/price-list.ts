import { env } from "cloudflare:workers";
import {
  priceListSections,
  type ManagedPriceListItem,
  type ManagedPriceListSection,
  type PriceListItem,
} from "../app/price-list-data";

type PriceItemRow = {
  item_id: string;
  table_id: string;
  name: string | null;
  note: string | null;
  prices_json: string;
  sort_order: number;
  active: number;
  custom: number;
};

type LoadPriceListOptions = {
  includeInactive?: boolean;
};

function mergePriceListRows(
  rows: PriceItemRow[],
  options: LoadPriceListOptions = {},
): ManagedPriceListSection[] {
  const baseRows = new Map(
    rows.filter((row) => row.custom !== 1).map((row) => [row.item_id, row] as const),
  );
  const customRowsByTable = new Map<string, PriceItemRow[]>();
  for (const row of rows) {
    if (row.custom !== 1) continue;
    const tableRows = customRowsByTable.get(row.table_id) ?? [];
    tableRows.push(row);
    customRowsByTable.set(row.table_id, tableRows);
  }

  return priceListSections.map((section) => ({
    ...section,
    tables: section.tables.map((table) => {
      const baseItems = table.items.map((item, index) => {
        const row = baseRows.get(item.id);
        return managedBaseItem(
          item,
          table.id,
          index * 10,
          row?.table_id === table.id ? row : undefined,
        );
      });
      const customItems = (customRowsByTable.get(table.id) ?? [])
        .map((row) => managedCustomItem(row, table.columns.length))
        .filter((item): item is ManagedPriceListItem => item !== null);

      return {
        ...table,
        items: [...baseItems, ...customItems]
          .filter((item) => options.includeInactive || item.active)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "hr")),
      };
    }),
  }));
}

function validValues(raw: string, expectedLength: number) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== expectedLength ||
      parsed.some((value) => typeof value !== "string" || value.length > 30)
    ) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

function managedBaseItem(
  item: PriceListItem,
  tableId: string,
  sortOrder: number,
  row?: PriceItemRow,
): ManagedPriceListItem {
  const values = row ? validValues(row.prices_json, item.cells.length) : null;
  return {
    ...item,
    name: row?.name?.trim() || item.name,
    note: row?.note ?? item.note,
    cells: item.cells.map((cell, index) => ({
      ...cell,
      value: values?.[index] ?? cell.value,
    })),
    tableId,
    active: row ? row.active === 1 : true,
    custom: false,
    sortOrder: row?.sort_order ?? sortOrder,
  };
}

function managedCustomItem(row: PriceItemRow, columnCount: number): ManagedPriceListItem | null {
  const values = validValues(row.prices_json, columnCount);
  const name = row.name?.trim();
  if (!values || !name || name.length > 120) return null;
  return {
    id: row.item_id,
    tableId: row.table_id,
    name,
    note: row.note?.trim() || undefined,
    cells: values.map((value) => ({ value })),
    active: row.active === 1,
    custom: true,
    sortOrder: row.sort_order,
  };
}

export async function loadPriceList(
  options: LoadPriceListOptions = {},
): Promise<ManagedPriceListSection[]> {
  const result = await env.DB.prepare(
    `SELECT item_id,table_id,name,note,prices_json,sort_order,active,custom
     FROM price_list_items`,
  ).all<PriceItemRow>();
  return mergePriceListRows(result.results ?? [], options);
}

export function loadBasePriceList(
  options: LoadPriceListOptions = {},
): ManagedPriceListSection[] {
  return mergePriceListRows([], options);
}
