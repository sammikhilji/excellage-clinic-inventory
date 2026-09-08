import type { StoreData } from "./db";
import type { Activity } from "./types";
import type {
  MonthlyStaffReport,
  ReportLine,
  StaffReport,
} from "./monthly-staff-report-types";

export type {
  MonthlyStaffReport,
  ReportLine,
  StaffReport,
} from "./monthly-staff-report-types";
export { REPORT_ALLOWED_ROLES } from "./monthly-staff-report-types";

const UNKNOWN_KEY = "__unknown__";
const UNKNOWN_LABEL = "Unknown / before login tracking";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate YYYY-MM-DD and that it is a real calendar date. */
export function parseDateParam(
  raw: string | null,
  label: string
): { date: string } | { error: string } {
  const value = (raw || "").trim();
  if (!DATE_RE.test(value)) {
    return { error: `Invalid ${label} (expected YYYY-MM-DD)` };
  }
  const [y, m, d] = value.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return { error: `Invalid ${label} (not a real date)` };
  }
  return { date: value };
}

/** Parse and validate inclusive from/to query params. */
export function parseDateRange(
  fromRaw: string | null,
  toRaw: string | null
): { from: string; to: string } | { error: string } {
  const fromParsed = parseDateParam(fromRaw, "from");
  if ("error" in fromParsed) return fromParsed;
  const toParsed = parseDateParam(toRaw, "to");
  if ("error" in toParsed) return toParsed;
  if (fromParsed.date > toParsed.date) {
    return { error: "Invalid range: from must be on or before to" };
  }
  return { from: fromParsed.date, to: toParsed.date };
}

/** @deprecated Prefer parseDateRange. Still used if year/month only are sent. */
export function parseYearMonth(
  yearRaw: string | null,
  monthRaw: string | null
): { year: number; month: number } | { error: string } {
  const year = parseInt(yearRaw || "", 10);
  const month = parseInt(monthRaw || "", 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return { error: "Invalid year (expected YYYY)" };
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return { error: "Invalid month (expected 1-12)" };
  }
  return { year, month };
}

export function formatRangeLabel(from: string, to: string): string {
  if (from === to) return from;
  return `${from} → ${to}`;
}

function isTransferFromMain(a: Activity): boolean {
  if (a.type !== "transfer") return false;
  const loc = a.location || "";
  return (
    loc.startsWith("Main Store →") ||
    loc.startsWith("Main Store ->") ||
    /^Main Store\s*→/.test(loc) ||
    /^Main Store\s*->/.test(loc)
  );
}

function isConsumptionOrSale(a: Activity): boolean {
  return a.type === "consumption" || a.type === "sale";
}

function parseToLocation(location: string): string {
  const arrow = location.includes("→")
    ? "→"
    : location.includes("->")
      ? "->"
      : null;
  if (!arrow) return location;
  const parts = location.split(arrow);
  return (parts[1] || "").trim() || location;
}

function staffKey(username: string | null | undefined): string {
  if (!username || !String(username).trim()) return UNKNOWN_KEY;
  return String(username).trim().toLowerCase();
}

/** Inclusive: created_at in [from 00:00:00, to 23:59:59]. */
function inDateRange(createdAt: string, from: string, to: string): boolean {
  if (!createdAt) return false;
  const start = `${from} 00:00:00`;
  const end = `${to} 23:59:59`;
  // created_at is stored as "YYYY-MM-DD HH:MM:SS" (lexicographic-safe)
  return createdAt >= start && createdAt <= end;
}

export function buildMonthlyStaffReport(
  store: StoreData,
  from: string,
  to: string
): MonthlyStaffReport {
  const productById = new Map(store.products.map((p) => [p.id, p]));
  const userByUsername = new Map(
    store.users.map((u) => [u.username.toLowerCase(), u])
  );

  const byStaff = new Map<
    string,
    {
      username: string | null;
      transfers_from_main: ReportLine[];
      consumptions: ReportLine[];
    }
  >();

  const ensure = (key: string, username: string | null) => {
    let bucket = byStaff.get(key);
    if (!bucket) {
      bucket = { username, transfers_from_main: [], consumptions: [] };
      byStaff.set(key, bucket);
    }
    return bucket;
  };

  for (const a of store.activity) {
    if (!inDateRange(a.created_at, from, to)) continue;

    const key = staffKey(a.username);
    const username = key === UNKNOWN_KEY ? null : key;
    const product = productById.get(a.product_id);
    const product_name =
      product?.product || a.product_name || `Product #${a.product_id}`;
    const barcode = product?.barcode || a.barcode || "";

    if (isTransferFromMain(a)) {
      const bucket = ensure(key, username);
      bucket.transfers_from_main.push({
        date: a.created_at,
        product_name,
        barcode,
        qty: a.qty,
        to_location: parseToLocation(a.location),
        note: a.note ?? null,
      });
    } else if (isConsumptionOrSale(a)) {
      const bucket = ensure(key, username);
      bucket.consumptions.push({
        date: a.created_at,
        product_name,
        barcode,
        qty: a.qty,
        location: a.location,
        type: a.type,
        note: a.note ?? null,
      });
    }
  }

  const staff: StaffReport[] = [];
  for (const [key, bucket] of byStaff) {
    const transfer_qty_sum = bucket.transfers_from_main.reduce(
      (s, r) => s + Number(r.qty || 0),
      0
    );
    const consumption_qty_sum = bucket.consumptions.reduce(
      (s, r) => s + Number(r.qty || 0),
      0
    );
    const transfer_count = bucket.transfers_from_main.length;
    const consumption_count = bucket.consumptions.length;
    if (transfer_count === 0 && consumption_count === 0) continue;

    bucket.transfers_from_main.sort((a, b) => a.date.localeCompare(b.date));
    bucket.consumptions.sort((a, b) => a.date.localeCompare(b.date));

    const user = key === UNKNOWN_KEY ? null : userByUsername.get(key);
    const full_name = user?.full_name ?? null;
    const display_name =
      key === UNKNOWN_KEY
        ? UNKNOWN_LABEL
        : full_name
          ? full_name
          : bucket.username || key;

    staff.push({
      username: bucket.username,
      full_name,
      display_name,
      transfers_from_main: bucket.transfers_from_main,
      consumptions: bucket.consumptions,
      totals: {
        transfer_qty_sum,
        consumption_qty_sum,
        transfer_count,
        consumption_count,
      },
    });
  }

  staff.sort((a, b) => {
    if (a.username === null && b.username !== null) return 1;
    if (b.username === null && a.username !== null) return -1;
    return a.display_name.localeCompare(b.display_name);
  });

  const grand_totals = {
    transfer_qty_sum: staff.reduce((s, x) => s + x.totals.transfer_qty_sum, 0),
    consumption_qty_sum: staff.reduce(
      (s, x) => s + x.totals.consumption_qty_sum,
      0
    ),
    transfer_count: staff.reduce((s, x) => s + x.totals.transfer_count, 0),
    consumption_count: staff.reduce(
      (s, x) => s + x.totals.consumption_count,
      0
    ),
    staff_count: staff.length,
  };

  const range_label = formatRangeLabel(from, to);
  const [fy, fm] = from.split("-").map((x) => parseInt(x, 10));

  return {
    from,
    to,
    range_label,
    year: fy,
    month: fm,
    month_label: range_label,
    staff,
    grand_totals,
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Flatten report to CSV rows for Excel. */
export function reportToCsv(report: MonthlyStaffReport): string {
  const header = [
    "staff_display_name",
    "username",
    "category",
    "date",
    "product_name",
    "barcode",
    "qty",
    "to_location",
    "location",
    "type",
    "note",
  ];
  const lines = [header.join(",")];
  for (const s of report.staff) {
    for (const t of s.transfers_from_main) {
      lines.push(
        [
          csvEscape(s.display_name),
          csvEscape(s.username),
          "transfer_from_main",
          csvEscape(t.date),
          csvEscape(t.product_name),
          csvEscape(t.barcode),
          csvEscape(t.qty),
          csvEscape(t.to_location),
          "",
          "transfer",
          csvEscape(t.note),
        ].join(",")
      );
    }
    for (const c of s.consumptions) {
      lines.push(
        [
          csvEscape(s.display_name),
          csvEscape(s.username),
          "consumption_or_sale",
          csvEscape(c.date),
          csvEscape(c.product_name),
          csvEscape(c.barcode),
          csvEscape(c.qty),
          "",
          csvEscape(c.location),
          csvEscape(c.type),
          csvEscape(c.note),
        ].join(",")
      );
    }
  }
  return lines.join("\n") + "\n";
}
