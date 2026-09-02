import type { ManagedPriceListSection } from "../app/price-list-data";

export const MAX_PRINT_CUSTOM_NAME_LENGTH = 64;
export const MAX_PRINT_CUSTOM_NOTE_LENGTH = 80;

export function activeCustomItemsInTable(
  sections: ManagedPriceListSection[],
  tableId: string,
) {
  return sections
    .flatMap((section) => section.tables)
    .find((table) => table.id === tableId)
    ?.items.filter((item) => item.active && item.custom).length ?? 0;
}

export function canAddActivePrintItem(
  sections: ManagedPriceListSection[],
  tableId: string,
) {
  return activeCustomItemsInTable(sections, tableId) < 1;
}
