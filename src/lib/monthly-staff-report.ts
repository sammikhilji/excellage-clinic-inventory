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

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const UNKNOWN_KEY = "__unknown__";
const UNKNOWN_LABEL = "Unknown / before login tracking";

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

function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
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

export function buildMonthlyStaffReport(
  store: StoreData,
  year: number,
  month: number
): MonthlyStaffReport {
  const prefix = monthPrefix(year, month);
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
    if (!a.created_at || !a.created_at.startsWith(prefix)) continue;

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

  return {
    year,
    month,
    month_label: `${MONTH_NAMES[month - 1]} ${year}`,
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
