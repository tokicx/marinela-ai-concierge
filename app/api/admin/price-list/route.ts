import { env } from "cloudflare:workers";
import { findPriceListTable } from "../../../price-list-data";
import {
  canManageUsers,
  getCurrentSalonUser,
  hasValidSameOrigin,
} from "../../../../lib/admin-auth";
import { readJsonBody } from "../../../../lib/request-security";
import { loadPriceList } from "../../../../lib/price-list";
import {
  canAddActivePrintItem,
  MAX_PRINT_CUSTOM_NAME_LENGTH,
  MAX_PRINT_CUSTOM_NOTE_LENGTH,
} from "../../../../lib/price-list-print";

export const dynamic = "force-dynamic";

const MAX_TABLE_ID_LENGTH = 80;
const MAX_NAME_LENGTH = MAX_PRINT_CUSTOM_NAME_LENGTH;
const MAX_NOTE_LENGTH = MAX_PRINT_CUSTOM_NOTE_LENGTH;
const MAX_PRICE_LENGTH = 30;

type CreatePriceItemPayload = {
  tableId?: unknown;
  name?: unknown;
  note?: unknown;
  prices?: unknown;
};

function cleanRequiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned && cleaned.length <= maxLength ? cleaned : null;
}

function cleanOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: null };
  }
  if (typeof value !== "string") return { ok: false as const };
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length > maxLength) return { ok: false as const };
  return { ok: true as const, value: cleaned || null };
}

function cleanPrices(value: unknown, expectedLength: number) {
  if (!Array.isArray(value) || value.length !== expectedLength) return null;
  const prices: string[] = [];
  for (const rawPrice of value) {
    if (typeof rawPrice !== "string") return null;
    const price = rawPrice.trim().replace(/\s+/g, " ");
    if (price.length > MAX_PRICE_LENGTH) return null;
    prices.push(price);
  }
  return prices.some(Boolean) ? prices : null;
}

export async function POST(request: Request) {
  const user = await getCurrentSalonUser();
  if (!user || !canManageUsers(user)) {
    return Response.json({ error: "Nemate ovlast za dodavanje stavki cjenika." }, { status: 403 });
  }
  if (!hasValidSameOrigin(request)) {
    return Response.json({ error: "Neispravan zahtjev." }, { status: 403 });
  }

  const body = await readJsonBody<CreatePriceItemPayload>(request, 4_096);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });

  const tableId = cleanRequiredText(body.value.tableId, MAX_TABLE_ID_LENGTH);
  const name = cleanRequiredText(body.value.name, MAX_NAME_LENGTH);
  const note = cleanOptionalText(body.value.note, MAX_NOTE_LENGTH);
  const table = tableId ? findPriceListTable(tableId) : null;
  if (!table) {
    return Response.json({ error: "Odaberite postojeću kategoriju cjenika." }, { status: 400 });
  }
  if (!name) {
    return Response.json({ error: `Naziv mora sadržavati najviše ${MAX_NAME_LENGTH} znakova.` }, { status: 400 });
  }
  if (!note.ok) {
    return Response.json({ error: `Napomena smije sadržavati najviše ${MAX_NOTE_LENGTH} znakova.` }, { status: 400 });
  }

  const prices = cleanPrices(body.value.prices, table.columns.length);
  if (!prices) {
    return Response.json(
      { error: `Unesite barem jednu cijenu i provjerite svih ${table.columns.length} polja.` },
      { status: 400 },
    );
  }

  const currentPriceList = await loadPriceList();
  if (!canAddActivePrintItem(currentPriceList, table.id)) {
    return Response.json(
      { error: "U ovoj tablici već postoji dodatna aktivna stavka. Uklonite je prije dodavanja druge kako bi cijeli cjenik sigurno ostao na jednom A4 listu." },
      { status: 409 },
    );
  }

  const baseNextOrder = table.items.length * 10;
  const itemId = `custom-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const actorEmail = user.email.toLowerCase();

  const insert = env.DB.prepare(
    `INSERT INTO price_list_items
      (item_id,table_id,name,note,prices_json,sort_order,active,custom,updated_by_email,created_at,updated_at)
     SELECT ?,?,?,?,?,MAX(?,COALESCE((SELECT MAX(sort_order) + 10 FROM price_list_items WHERE table_id = ?),?)),1,1,?,?,?
     WHERE NOT EXISTS (
       SELECT 1 FROM price_list_items WHERE table_id = ? AND custom = 1 AND active = 1
     )`,
  ).bind(
    itemId,
    table.id,
    name,
    note.value,
    JSON.stringify(prices),
    baseNextOrder,
    table.id,
    baseNextOrder,
    actorEmail,
    now,
    now,
    table.id,
  );

  const auditDetails = JSON.stringify({
    tableId: table.id,
    name,
    populatedPrices: prices.filter(Boolean).length,
  });
  const audit = env.DB.prepare(
    `INSERT INTO admin_audit_log (id,actor_email,action,target_type,target_id,details,created_at)
     SELECT ?,lower(?),'price_list_item_created','price_list_item',?,?,?
     FROM price_list_items WHERE item_id = ? AND active = 1`,
  ).bind(crypto.randomUUID(), user.email, itemId, auditDetails, now, itemId);
  const [created] = await env.DB.batch([insert, audit]);
  if ((created.meta.changes ?? 0) !== 1) {
    return Response.json(
      { error: "Stavka nije dodana jer bi cjenik prešao sigurni kapacitet jedne A4 stranice." },
      { status: 409 },
    );
  }

  return Response.json({ ok: true, itemId }, { status: 201 });
}
