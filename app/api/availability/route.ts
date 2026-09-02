import { availableTimes, availableTimesForDates } from "../../../lib/availability";
import { consumeRateLimit, requestClientIp } from "../../../lib/rate-limit";
import { loadServices } from "../../../lib/salon-settings";
import { isDateWithinBookingWindow } from "../../../lib/time";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    fetchSite === "cross-site"
  ) {
    return Response.json({ error: "Neispravan izvor zahtjeva." }, { status: 403 });
  }

  const url = new URL(request.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const staffId = url.searchParams.get("staffId") ?? "";
  const date = url.searchParams.get("date") ?? "";
  const datesParameter = url.searchParams.get("dates") ?? "";
  if (datesParameter.length > 164) {
    return Response.json({ error: "Neispravan upit za raspoloživost." }, { status: 400 });
  }
  const batchDates = datesParameter
    ? Array.from(new Set(datesParameter.split(",").filter(Boolean)))
    : [];
  const requestedDates = batchDates.length ? batchDates : date ? [date] : [];
  if (
    serviceId.length > 80 ||
    Boolean(date) === Boolean(datesParameter) ||
    requestedDates.length === 0 ||
    requestedDates.length > 15 ||
    requestedDates.some((candidate) => !isDateWithinBookingWindow(candidate)) ||
    !["marinela", "mia", "first"].includes(staffId)
  ) {
    return Response.json({ error: "Neispravan upit za raspoloživost." }, { status: 400 });
  }
  const allowed = await consumeRateLimit({
    scope: "availability_ip",
    identifier: requestClientIp(request),
    limit: 90,
    windowSeconds: 10 * 60,
    failureMode: "deny",
  });
  if (!allowed) {
    return Response.json(
      { error: "Previše provjera termina. Pričekajte nekoliko minuta i pokušajte ponovno." },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }
  const services = await loadServices({ strict: true }).catch(() => null);
  if (!services) {
    return Response.json({ error: "Raspoloživost trenutačno nije moguće provjeriti." }, { status: 503 });
  }
  const service = services.find((item) => item.id === serviceId);

  if (!service) {
    return Response.json({ error: "Neispravan upit za raspoloživost." }, { status: 400 });
  }
  if (
    staffId !== "first" &&
    !service.staffIds.includes(staffId as "marinela" | "mia")
  ) {
    const empty = Object.fromEntries(
      requestedDates.map((candidate) => [
        candidate,
        { times: [], employeeByTime: {}, checked: true },
      ]),
    );
    return Response.json(
      batchDates.length ? { dates: empty } : empty[requestedDates[0]],
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const normalizedStaffId = staffId as "marinela" | "mia" | "first";
    const result = batchDates.length
      ? { dates: await availableTimesForDates(service, normalizedStaffId, requestedDates) }
      : await availableTimes(service, normalizedStaffId, requestedDates[0]);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Raspoloživost trenutačno nije moguće provjeriti." },
      { status: 503 },
    );
  }
}
