import type { StoreData } from "./db";
import type { Activity } from "./types";
import type {
  MonthlyStaffReport,
  ReportLine,
  StaffReport,
} from "./monthly-staff-report-types";
import { getStockGroup, type StockGroup } from "./stock-groups";
import ExcelJS from "exceljs";

export type {
  MonthlyStaffReport,
  ReportLine,
  StaffReport,
} from "./monthly-staff-report-types";
export { REPORT_ALLOWED_ROLES } from "./monthly-staff-report-types";

const UNKNOWN_KEY = "__unknown__";
const UNKNOWN_LABEL = "Unknown / before login tracking";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Crash Cart bulk-import notes (username `import`). Product "stock sheet" lines are NOT matched. */
const CRASH_CART_IMPORT_NOTE_RE = /crash cart import/i;

export type StaffReportFilterOptions = {
  /** Exact product category match; empty/null = all */
  category?: string | null;
  /** Stock group from getStockGroup; null = all */
  stockGroup?: StockGroup | null;
  /**
   * When false (default), skip Crash Cart bulk imports (username===import with
   * crash-cart import note, or import user on a crash_cart product) — unless
   * stockGroup is crash_cart. Product stock-sheet adjustments are never auto-hidden.
   */
  includeImports?: boolean;
};

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

/** Parse category / group / includeImports from report query string. */
export function parseReportFilterParams(
  sp: URLSearchParams
): StaffReportFilterOptions {
  const category = (sp.get("category") || "").trim() || null;
  const groupRaw = (sp.get("group") || "").trim().toLowerCase();
  let stockGroup: StockGroup | null = null;
  if (
    groupRaw === "products" ||
    groupRaw === "consumables" ||
    groupRaw === "crash_cart"
  ) {
    stockGroup = groupRaw;
  }
  const includeRaw = (sp.get("includeImports") || "").trim().toLowerCase();
  const includeImports =
    includeRaw === "1" || includeRaw === "true" || includeRaw === "yes";
  return { category, stockGroup, includeImports };
}

/**
 * True for Crash Cart bulk imports only.
 * Product stock-sheet updates (note like "Sep 18 2026 stock sheet") are NOT treated as bulk imports.
 */
function isCrashCartBulkImport(
  a: Activity,
  product: { category?: string | null; product?: string | null } | undefined
): boolean {
  const user = (a.username || "").trim().toLowerCase();
  if (user !== "import") return false;
  if (CRASH_CART_IMPORT_NOTE_RE.test(a.note || "")) return true;
  const group = getStockGroup(
    product || { category: "", product: a.product_name || "" }
  );
  return group === "crash_cart";
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

function isReceive(a: Activity): boolean {
  return a.type === "receive";
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

function activityMatchesFilters(
  a: Activity,
  product: { category?: string | null; product?: string | null } | undefined,
  options: StaffReportFilterOptions | undefined
): boolean {
  const opts = options || {};
  const includeImports = !!opts.includeImports;
  const stockGroup = opts.stockGroup ?? null;
  const category = (opts.category || "").trim() || null;

  // Exclude Crash Cart bulk imports unless scoped to Crash Cart or opted in.
  // Product / consumable stock-sheet lines are kept even when includeImports is false.
  if (
    !includeImports &&
    stockGroup !== "crash_cart" &&
    isCrashCartBulkImport(a, product)
  ) {
    return false;
  }

  if (stockGroup) {
    const group = getStockGroup(
      product || { category: "", product: a.product_name || "" }
    );
    if (group !== stockGroup) return false;
  }

  if (category) {
    const prodCat = (product?.category || "").trim();
    if (prodCat !== category) return false;
  }

  return true;
}

export function buildMonthlyStaffReport(
  store: StoreData,
  from: string,
  to: string,
  options?: StaffReportFilterOptions
): MonthlyStaffReport {
  const productById = new Map(store.products.map((p) => [p.id, p]));
  const userByUsername = new Map(
    store.users.map((u) => [u.username.toLowerCase(), u])
  );

  const byStaff = new Map<
    string,
    {
      username: string | null;
      receives: ReportLine[];
      transfers_from_main: ReportLine[];
      consumptions: ReportLine[];
    }
  >();

  const ensure = (key: string, username: string | null) => {
    let bucket = byStaff.get(key);
    if (!bucket) {
      bucket = {
        username,
        receives: [],
        transfers_from_main: [],
        consumptions: [],
      };
      byStaff.set(key, bucket);
    }
    return bucket;
  };

  for (const a of store.activity) {
    if (!inDateRange(a.created_at, from, to)) continue;

    const product = productById.get(a.product_id);
    if (!activityMatchesFilters(a, product, options)) continue;

    const key = staffKey(a.username);
    const username = key === UNKNOWN_KEY ? null : key;
    const product_name =
      product?.product || a.product_name || `Product #${a.product_id}`;
    const barcode = product?.barcode || a.barcode || "";
    const category = (product?.category || "").trim();

    if (isReceive(a)) {
      const bucket = ensure(key, username);
      bucket.receives.push({
        date: a.created_at,
        product_name,
        category,
        barcode,
        qty: a.qty,
        location: a.location,
        type: a.type,
        note: a.note ?? null,
      });
    } else if (isTransferFromMain(a)) {
      const bucket = ensure(key, username);
      bucket.transfers_from_main.push({
        date: a.created_at,
        product_name,
        category,
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
        category,
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
    const receive_qty_sum = bucket.receives.reduce(
      (s, r) => s + Number(r.qty || 0),
      0
    );
    const transfer_qty_sum = bucket.transfers_from_main.reduce(
      (s, r) => s + Number(r.qty || 0),
      0
    );
    const consumption_qty_sum = bucket.consumptions.reduce(
      (s, r) => s + Number(r.qty || 0),
      0
    );
    const receive_count = bucket.receives.length;
    const transfer_count = bucket.transfers_from_main.length;
    const consumption_count = bucket.consumptions.length;
    if (receive_count === 0 && transfer_count === 0 && consumption_count === 0)
      continue;

    bucket.receives.sort((a, b) => a.date.localeCompare(b.date));
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
      receives: bucket.receives,
      transfers_from_main: bucket.transfers_from_main,
      consumptions: bucket.consumptions,
      totals: {
        receive_qty_sum,
        transfer_qty_sum,
        consumption_qty_sum,
        receive_count,
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
    receive_qty_sum: staff.reduce((s, x) => s + x.totals.receive_qty_sum, 0),
    transfer_qty_sum: staff.reduce((s, x) => s + x.totals.transfer_qty_sum, 0),
    consumption_qty_sum: staff.reduce(
      (s, x) => s + x.totals.consumption_qty_sum,
      0
    ),
    receive_count: staff.reduce((s, x) => s + x.totals.receive_count, 0),
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
    "activity",
    "date",
    "product_name",
    "product_category",
    "barcode",
    "qty",
    "to_location",
    "location",
    "type",
    "note",
  ];
  const lines = [header.join(",")];
  for (const s of report.staff) {
    for (const r of s.receives) {
      lines.push(
        [
          csvEscape(s.display_name),
          csvEscape(s.username),
          "stock_added",
          csvEscape(r.date),
          csvEscape(r.product_name),
          csvEscape(r.category),
          csvEscape(r.barcode),
          csvEscape(r.qty),
          "",
          csvEscape(r.location),
          "receive",
          csvEscape(r.note),
        ].join(",")
      );
    }
    for (const t of s.transfers_from_main) {
      lines.push(
        [
          csvEscape(s.display_name),
          csvEscape(s.username),
          "transfer_from_main",
          csvEscape(t.date),
          csvEscape(t.product_name),
          csvEscape(t.category),
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
          csvEscape(c.category),
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

/** Real .xlsx workbook: table columns matching the staff PDF. */
export async function reportToXlsx(
  report: MonthlyStaffReport
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Clinic Inventory";
  wb.created = new Date();

  const PURPLE = "482980";
  const ZEBRA = "F5F5F7";

  const sheet = wb.addWorksheet("Staff stock", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Staff", key: "staff", width: 22 },
    { header: "Date", key: "date", width: 20 },
    { header: "Product", key: "product", width: 36 },
    { header: "Category", key: "category", width: 18 },
    { header: "Qty", key: "qty", width: 10 },
    { header: "Location", key: "location", width: 22 },
    { header: "Type", key: "type", width: 18 },
    { header: "Note", key: "note", width: 40 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${PURPLE}` },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  const pushRow = (
    staff: string,
    date: string,
    product: string,
    category: string,
    qty: number,
    location: string,
    type: string,
    note: string
  ) => {
    const row = sheet.addRow({
      staff,
      date,
      product,
      category,
      qty,
      location,
      type,
      note,
    });
    const idx = row.number;
    if (idx % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${ZEBRA}` },
      };
    }
    row.getCell("qty").alignment = { horizontal: "right" };
  };

  for (const s of report.staff) {
    for (const r of s.receives) {
      pushRow(
        s.display_name,
        r.date,
        r.product_name,
        r.category || "",
        r.qty,
        r.location ?? "",
        "Stock added",
        r.note ?? ""
      );
    }
    for (const t of s.transfers_from_main) {
      pushRow(
        s.display_name,
        t.date,
        t.product_name,
        t.category || "",
        t.qty,
        t.to_location ?? "",
        "Transfer from Main",
        t.note ?? ""
      );
    }
    for (const c of s.consumptions) {
      const typeLabel =
        c.type === "sale"
          ? "Sale"
          : c.type === "consumption"
            ? "Use / sale"
            : c.type || "Use / sale";
      pushRow(
        s.display_name,
        c.date,
        c.product_name,
        c.category || "",
        c.qty,
        c.location ?? "",
        typeLabel,
        c.note ?? ""
      );
    }
  }

  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 24 },
    { header: "Value", key: "value", width: 40 },
  ];
  const sumHeader = summary.getRow(1);
  sumHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  sumHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${PURPLE}` },
  };
  summary.addRow({ metric: "Range", value: report.range_label });
  summary.addRow({
    metric: "Staff count",
    value: report.grand_totals.staff_count,
  });
  summary.addRow({
    metric: "Stock added (qty)",
    value: report.grand_totals.receive_qty_sum,
  });
  summary.addRow({
    metric: "Stock added (lines)",
    value: report.grand_totals.receive_count,
  });
  summary.addRow({
    metric: "Transfers from Main (qty)",
    value: report.grand_totals.transfer_qty_sum,
  });
  summary.addRow({
    metric: "Transfers from Main (lines)",
    value: report.grand_totals.transfer_count,
  });
  summary.addRow({
    metric: "Use / sale (qty)",
    value: report.grand_totals.consumption_qty_sum,
  });
  summary.addRow({
    metric: "Use / sale (lines)",
    value: report.grand_totals.consumption_count,
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

