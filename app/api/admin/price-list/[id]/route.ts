import { env } from "cloudflare:workers";
import {
  findBasePriceListItem,
  findPriceListTable,
} from "../../../../price-list-data";
import {
  canManageUsers,
  getCurrentSalonUser,
  hasValidSameOrigin,
  prepareAdminAudit,
} from "../../../../../lib/admin-auth";
import { readJsonBody } from "../../../../../lib/request-security";
import { loadPriceList } from "../../../../../lib/price-list";
import {
  canAddActivePrintItem,
  MAX_PRINT_CUSTOM_NAME_LENGTH,
  MAX_PRINT_CUSTOM_NOTE_LENGTH,
} from "../../../../../lib/price-list-print";

export const dynamic = "force-dynamic";

const MAX_ITEM_ID_LENGTH = 100;
const MAX_NAME_LENGTH = MAX_PRINT_CUSTOM_NAME_LENGTH;
const MAX_NOTE_LENGTH = MAX_PRINT_CUSTOM_NOTE_LENGTH;
const MAX_PRICE_LENGTH = 30;

type PriceItemPayload = {
  prices?: unknown;
  active?: unknown;
  name?: unknown;
  note?: unknown;
};

type StoredPriceItem = {
  item_id: string;
  table_id: string;
  name: string | null;
  note: string | null;
  prices_json: string;
  sort_order: number;
  active: number;
  custom: number;
};

function validItemId(value: string) {
  return value.length > 0 && value.length <= MAX_ITEM_ID_LENGTH && /^[a-z0-9-]+$/i.test(value);
}

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

async function authorized(request: Request) {
  const user = await getCurrentSalonUser();
  if (!user || !canManageUsers(user)) return null;
  if (!hasValidSameOrigin(request)) return null;
  return user;
}

async function findStoredItem(itemId: string) {
  return env.DB.prepare(
    `SELECT item_id,table_id,name,note,prices_json,sort_order,active,custom
     FROM price_list_items WHERE item_id = ? LIMIT 1`,
  ).bind(itemId).first<StoredPriceItem>();
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authorized(request);
  if (!user) {
    return Response.json({ error: "Nemate ovlast za uređivanje cjenika." }, { status: 403 });
  }

  const { id } = await params;
  if (!validItemId(id)) {
    return Response.json({ error: "Stavka cjenika nije pronađena." }, { status: 404 });
  }

  const [baseItem, storedItem] = await Promise.all([
    Promise.resolve(findBasePriceListItem(id)),
    findStoredItem(id),
  ]);
  const isCustom = storedItem?.custom === 1 && !baseItem;
  if (!baseItem && !isCustom) {
    return Response.json({ error: "Stavka cjenika nije pronađena." }, { status: 404 });
  }

  const table = baseItem?.table ?? findPriceListTable(storedItem!.table_id);
  if (!table) {
    return Response.json({ error: "Kategorija stavke cjenika više nije dostupna." }, { status: 409 });
  }

  const body = await readJsonBody<PriceItemPayload>(request, 4_096);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const payload = body.value;

  const restoring = payload.active === true;
  if (payload.active !== undefined && payload.active !== true) {
    return Response.json({ error: "Za uklanjanje stavke koristite naredbu Ukloni." }, { status: 400 });
  }

  const hasPrices = payload.prices !== undefined;
  const hasName = payload.name !== undefined;
  const hasNote = payload.note !== undefined;
  if (!restoring && !hasPrices && !hasName && !hasNote) {
    return Response.json({ error: "Nema promjena za spremanje." }, { status: 400 });
  }
  if (baseItem && (hasName || hasNote)) {
    return Response.json({ error: "Naziv izvorne stavke nije moguće mijenjati." }, { status: 400 });
  }

  if (restoring && isCustom && storedItem?.active !== 1) {
    const currentPriceList = await loadPriceList();
    if (!canAddActivePrintItem(currentPriceList, storedItem!.table_id)) {
      return Response.json(
        { error: "Stavku nije moguće vratiti jer bi cjenik prešao sigurni kapacitet jedne A4 stranice." },
        { status: 409 },
      );
    }
  }

  const prices = hasPrices ? cleanPrices(payload.prices, table.columns.length) : null;
  if (hasPrices && !prices) {
    return Response.json(
      { error: `Unesite barem jednu cijenu i provjerite svih ${table.columns.length} polja.` },
      { status: 400 },
    );
  }

  let customName = storedItem?.name ?? null;
  let customNote = storedItem?.note ?? null;
  if (isCustom && hasName) {
    customName = cleanRequiredText(payload.name, MAX_NAME_LENGTH);
    if (!customName) {
      return Response.json({ error: `Naziv mora sadržavati najviše ${MAX_NAME_LENGTH} znakova.` }, { status: 400 });
    }
  }
  if (isCustom && hasNote) {
    const note = cleanOptionalText(payload.note, MAX_NOTE_LENGTH);
    if (!note.ok) {
      return Response.json({ error: `Napomena smije sadržavati najviše ${MAX_NOTE_LENGTH} znakova.` }, { status: 400 });
    }
    customNote = note.value;
  }

  const now = new Date().toISOString();
  const actorEmail = user.email.toLowerCase();
  const auditAction = restoring && !hasPrices && !hasName && !hasNote
    ? "price_list_item_restored"
    : "price_list_item_updated";
  const auditDetails = JSON.stringify({
    name: baseItem?.item.name ?? customName,
    custom: isCustom,
    restored: restoring,
    populatedPrices: prices?.filter(Boolean).length,
  });
  const audit = prepareAdminAudit({
    actorEmail: user.email,
    action: auditAction,
    targetType: "price_list_item",
    targetId: id,
    details: auditDetails,
  });

  if (baseItem) {
    const effectivePrices = prices ?? baseItem.item.cells.map((cell: { value: string }) => cell.value);
    const mutation = env.DB.prepare(
      `INSERT INTO price_list_items
        (item_id,table_id,name,note,prices_json,sort_order,active,custom,updated_by_email,created_at,updated_at)
       VALUES (?,?,NULL,NULL,?,?,1,0,?,?,?)
       ON CONFLICT(item_id) DO UPDATE SET
         table_id = excluded.table_id,
         prices_json = CASE WHEN ? = 1 THEN excluded.prices_json ELSE price_list_items.prices_json END,
         sort_order = excluded.sort_order,
         active = CASE WHEN ? = 1 THEN 1 ELSE price_list_items.active END,
         updated_by_email = excluded.updated_by_email,
         updated_at = excluded.updated_at`,
    ).bind(
      id,
      baseItem.table.id,
      JSON.stringify(effectivePrices),
      baseItem.index * 10,
      actorEmail,
      now,
      now,
      hasPrices ? 1 : 0,
      restoring ? 1 : 0,
    );
    await env.DB.batch([mutation, audit]);
  } else {
    const effectivePrices = prices ?? (() => {
      try {
        const parsed = JSON.parse(storedItem!.prices_json) as unknown;
        return cleanPrices(parsed, table.columns.length);
      } catch {
        return null;
      }
    })();
    if (!effectivePrices) {
      return Response.json({ error: "Spremljene cijene nisu čitljive. Ponovno unesite cijene." }, { status: 409 });
    }
    const mutation = env.DB.prepare(
      `UPDATE price_list_items SET
         name = ?, note = ?, prices_json = ?,
         active = CASE WHEN ? = 1 THEN 1 ELSE active END,
         updated_by_email = ?, updated_at = ?
       WHERE item_id = ? AND custom = 1
         AND (
           ? = 0
           OR active = 1
           OR NOT EXISTS (
             SELECT 1 FROM price_list_items active_custom
             WHERE active_custom.table_id = price_list_items.table_id
               AND active_custom.custom = 1
               AND active_custom.active = 1
               AND active_custom.item_id != price_list_items.item_id
           )
         )`,
    ).bind(
      customName,
      customNote,
      JSON.stringify(effectivePrices),
      restoring ? 1 : 0,
      actorEmail,
      now,
      id,
      restoring ? 1 : 0,
    );
    const conditionalAudit = env.DB.prepare(
      `INSERT INTO admin_audit_log (id,actor_email,action,target_type,target_id,details,created_at)
       SELECT ?,lower(?),?,'price_list_item',?,?,?
       FROM price_list_items
       WHERE item_id = ? AND custom = 1 AND updated_at = ? AND updated_by_email = ?`,
    ).bind(
      crypto.randomUUID(),
      user.email,
      auditAction,
      id,
      auditDetails,
      now,
      id,
      now,
      actorEmail,
    );
    const [updated] = await env.DB.batch([mutation, conditionalAudit]);
    if ((updated.meta.changes ?? 0) !== 1) {
      return Response.json(
        { error: "Stavka nije spremljena jer bi cjenik prešao sigurni kapacitet jedne A4 stranice." },
        { status: 409 },
      );
    }
  }

  return Response.json({ ok: true, active: restoring ? true : undefined, prices: prices ?? undefined });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authorized(request);
  if (!user) {
    return Response.json({ error: "Nemate ovlast za uklanjanje stavki cjenika." }, { status: 403 });
  }

  const { id } = await params;
  if (!validItemId(id)) {
    return Response.json({ error: "Stavka cjenika nije pronađena." }, { status: 404 });
  }

  const [baseItem, storedItem] = await Promise.all([
    Promise.resolve(findBasePriceListItem(id)),
    findStoredItem(id),
  ]);
  const isCustom = storedItem?.custom === 1 && !baseItem;
  if (!baseItem && !isCustom) {
    return Response.json({ error: "Stavka cjenika nije pronađena." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const actorEmail = user.email.toLowerCase();
  const audit = prepareAdminAudit({
    actorEmail: user.email,
    action: "price_list_item_removed",
    targetType: "price_list_item",
    targetId: id,
    details: JSON.stringify({
      name: baseItem?.item.name ?? storedItem?.name,
      custom: isCustom,
    }),
  });

  if (baseItem) {
    const mutation = env.DB.prepare(
      `INSERT INTO price_list_items
        (item_id,table_id,name,note,prices_json,sort_order,active,custom,updated_by_email,created_at,updated_at)
       VALUES (?,?,NULL,NULL,?,?,0,0,?,?,?)
       ON CONFLICT(item_id) DO UPDATE SET
         active = 0,
         updated_by_email = excluded.updated_by_email,
         updated_at = excluded.updated_at`,
    ).bind(
      id,
      baseItem.table.id,
      JSON.stringify(baseItem.item.cells.map((cell: { value: string }) => cell.value)),
      baseItem.index * 10,
      actorEmail,
      now,
      now,
    );
    await env.DB.batch([mutation, audit]);
  } else {
    const mutation = env.DB.prepare(
      `UPDATE price_list_items
       SET active = 0, updated_by_email = ?, updated_at = ?
       WHERE item_id = ? AND custom = 1`,
    ).bind(actorEmail, now, id);
    await env.DB.batch([mutation, audit]);
  }

  return Response.json({ ok: true, active: false });
}
