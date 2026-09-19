import type { StoreData } from "./db";
import { stockValue, toStockingUnits } from "./stock-metrics";
import {
  getStockGroup,
  STOCK_GROUP_LABELS,
  type StockGroup,
} from "./stock-groups";
import { parseDateParam } from "./monthly-staff-report";

export type { StockGroup };

/** One product row with qty pivoted across clinic locations. */
export type StockValueRow = {
  product_id: number;
  product: string;
  category: string;
  /** Product expiry date string (as stored), or null. */
  expiry: string | null;
  /** Normalized display status. */
  status: string;
  /** Total stocking units across shown location columns. */
  total_qty: number;
  /** Sum of stockValue across included holdings. */
  total_value: number;
  /** Stocking units keyed by full location name. */
  qty_by_location: Record<string, number>;
  stock_group: StockGroup;
};

export type DepartmentSubtotal = {
  department: string;
  /** Short header for this location column. */
  header: string;
  line_count: number;
  qty_sum: number;
  value_sum: number;
};

export type StockValueReport = {
  /** As-of label (YYYY-MM-DD); stock is always live current. */
  as_of: string;
  location: string | null;
  category: string | null;
  group: StockGroup | null;
  include_zero: boolean;
  title: string;
  filters_label: string;
  /** Full location names for columns (display order). */
  location_columns: string[];
  /** Short headers parallel to location_columns (MAIN, AHMAD, …). */
  location_headers: string[];
  rows: StockValueRow[];
  by_department: DepartmentSubtotal[];
  grand_total: number;
  grand_qty: number;
  row_count: number;
  /** Distinct products with normalized Expired status. */
  expired_count: number;
  /** Distinct products expiring this month / ≤90d / ≤6m. */
  expiring_soon_count: number;
  /** Clinic locations for UI filters. */
  locations: string[];
  /** Product categories for UI filters. */
  categories: string[];
};

export type StockValueFilterOptions = {
  /** Exact location match; empty/null = all departments */
  location?: string | null;
  /** Exact category match; empty/null = all */
  category?: string | null;
  /** Stock group from getStockGroup; null = all */
  stockGroup?: StockGroup | null;
  /** Include products with total qty 0 (default false). */
  includeZero?: boolean;
};

const GROUP_QUERY: Record<string, StockGroup> = {
  products: "products",
  consumables: "consumables",
  crash_cart: "crash_cart",
  "crash-cart": "crash_cart",
  crashcart: "crash_cart",
};

/** Short column header for a clinic location (Main Store → MAIN, etc.). */
export function locationShortHeader(name: string): string {
  const n = (name || "").trim();
  const lower = n.toLowerCase();
  if (lower.includes("main")) return "MAIN";
  if (lower.includes("ahmad")) return "AHMAD";
  if (lower.includes("saly")) return "SALY";
  if (lower.includes("niveen")) return "NIVEEN";
  if (lower.includes("sassani") || lower.includes("sassan")) return "SASSANI";
  if (lower.includes("crash")) return "CRASH";
  const stripped = n.replace(/^Dr\.?\s*/i, "").trim();
  const word = (stripped.split(/\s+/)[0] || n).slice(0, 8);
  return word.toUpperCase();
}

/**
 * Normalize status strings for KPI matching (≤ vs <=, case, spacing).
 * Returns a canonical label when recognized; otherwise the trimmed original.
 */
export function normalizeStatus(status: string | null | undefined): string {
  const raw = (status || "").trim();
  if (!raw) return "OK";
  const t = raw
    .toLowerCase()
    .replace(/≤/g, "<=")
    .replace(/\s+/g, " ")
    .trim();

  if (t === "expired") return "Expired";
  if (t === "expires this month") return "Expires this month";
  if (
    t.startsWith("expiring") &&
    (t.includes("90") || t.includes("<=90") || t.includes("<90"))
  ) {
    return "Expiring ≤90 days";
  }
  if (
    t.startsWith("expiring") &&
    (t.includes("6 month") || t.includes("6month") || t.includes("<=6"))
  ) {
    return "Expiring ≤6 months";
  }
  if (t === "ok" || t === "in stock") return "OK";
  if (t === "no date" || t === "no expiry") return "No date";
  if (t === "out of stock" || t === "oos") return "OUT OF STOCK";
  return raw;
}

export function isExpiredStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "Expired";
}

export function isExpiringSoonStatus(
  status: string | null | undefined
): boolean {
  const n = normalizeStatus(status);
  return (
    n === "Expires this month" ||
    n === "Expiring ≤90 days" ||
    n === "Expiring ≤6 months"
  );
}

/** Parse date (as-of label only). Defaults to today Asia/Dubai if omitted. */
export function parseAsOfDate(
  raw: string | null
): { date: string } | { error: string } {
  const value = (raw || "").trim();
  if (!value) {
    return { date: ymdInDubai() };
  }
  return parseDateParam(value, "date");
}

export function ymdInDubai(d = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

export function parseStockValueFilterParams(
  sp: URLSearchParams
): StockValueFilterOptions | { error: string } {
  const location = (sp.get("location") || "").trim() || null;
  const category = (sp.get("category") || "").trim() || null;
  const groupRaw = (sp.get("group") || "").trim().toLowerCase();
  let stockGroup: StockGroup | null = null;
  if (groupRaw) {
    stockGroup = GROUP_QUERY[groupRaw] ?? null;
    if (!stockGroup) {
      return {
        error:
          "Invalid group (use products, consumables, crash_cart, or omit for all)",
      };
    }
  }
  const zeroRaw = (sp.get("includeZero") || sp.get("zero") || "")
    .trim()
    .toLowerCase();
  const includeZero =
    zeroRaw === "1" || zeroRaw === "true" || zeroRaw === "yes";
  return { location, category, stockGroup, includeZero };
}

function filtersLabel(opts: {
  location: string | null;
  category: string | null;
  stockGroup: StockGroup | null;
  includeZero: boolean;
}): string {
  const parts: string[] = [];
  parts.push(
    opts.location ? `Department: ${opts.location}` : "Department: All"
  );
  parts.push(opts.category ? `Category: ${opts.category}` : "Category: All");
  parts.push(
    opts.stockGroup
      ? `Scope: ${STOCK_GROUP_LABELS[opts.stockGroup]}`
      : "Scope: All"
  );
  if (opts.includeZero) parts.push("Incl. zero stock");
  return parts.join(" · ");
}

/**
 * Live current stock snapshot as a product × location pivot
 * (qty, value, expiry — no transaction history).
 * One row per product; location columns from store.locations (or the
 * filtered department). Qty in stocking units; value = sum of stockValue.
 */
export function buildStockValueReport(
  store: StoreData,
  asOf: string,
  filters: StockValueFilterOptions = {}
): StockValueReport {
  const location = (filters.location || "").trim() || null;
  const category = (filters.category || "").trim() || null;
  const stockGroup = filters.stockGroup ?? null;
  const includeZero = !!filters.includeZero;

  const locations = Array.isArray(store.locations)
    ? store.locations.slice()
    : [];
  const categories = [
    ...new Set(store.products.map((p) => p.category).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const location_columns = location ? [location] : locations.slice();
  const location_headers = location_columns.map(locationShortHeader);

  // product_id → location → raw qty
  const holdings = new Map<number, Map<string, number>>();
  for (const h of store.stock) {
    let byLoc = holdings.get(h.product_id);
    if (!byLoc) {
      byLoc = new Map();
      holdings.set(h.product_id, byLoc);
    }
    byLoc.set(h.location, (byLoc.get(h.location) || 0) + (h.qty || 0));
  }

  const rows: StockValueRow[] = [];

  for (const p of store.products) {
    if (category && p.category !== category) continue;
    const group = getStockGroup(p);
    if (stockGroup && group !== stockGroup) continue;

    const byLoc = holdings.get(p.id);
    const qty_by_location: Record<string, number> = {};
    let total_qty = 0;
    let total_value = 0;

    for (const loc of location_columns) {
      const raw = byLoc?.get(loc) ?? 0;
      const qty = toStockingUnits(p.product, raw);
      qty_by_location[loc] = qty;
      total_qty += qty;
      total_value += stockValue(p.price, raw);
    }

    if (!includeZero && !(total_qty > 0)) continue;

    rows.push({
      product_id: p.id,
      product: p.product,
      category: p.category,
      expiry: p.expiry ?? null,
      status: normalizeStatus(p.status),
      total_qty,
      total_value,
      qty_by_location,
      stock_group: group,
    });
  }

  rows.sort((a, b) => {
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    return a.product.localeCompare(b.product);
  });

  // Per-location column totals (qty + approximate value share by raw holdings)
  const by_department: DepartmentSubtotal[] = location_columns.map(
    (dept, i) => {
      let qty_sum = 0;
      let value_sum = 0;
      let line_count = 0;
      for (const r of rows) {
        const q = r.qty_by_location[dept] || 0;
        if (q > 0) line_count += 1;
        qty_sum += q;
      }
      // Value per location from raw holdings
      for (const p of store.products) {
        if (category && p.category !== category) continue;
        const group = getStockGroup(p);
        if (stockGroup && group !== stockGroup) continue;
        const raw = holdings.get(p.id)?.get(dept) ?? 0;
        if (!includeZero && raw <= 0) continue;
        // Only count value if product is in rows
        if (!rows.some((r) => r.product_id === p.id)) continue;
        value_sum += stockValue(p.price, raw);
      }
      return {
        department: dept,
        header: location_headers[i],
        line_count,
        qty_sum,
        value_sum,
      };
    }
  );

  const grand_total = rows.reduce((s, r) => s + r.total_value, 0);
  const grand_qty = rows.reduce((s, r) => s + r.total_qty, 0);

  const fl = filtersLabel({ location, category, stockGroup, includeZero });
  const title = `Clinic Inventory - Current stock report · As of ${asOf} · ${fl}`;

  const expired_count = rows.filter((r) => isExpiredStatus(r.status)).length;
  const expiring_soon_count = rows.filter((r) =>
    isExpiringSoonStatus(r.status)
  ).length;

  return {
    as_of: asOf,
    location,
    category,
    group: stockGroup,
    include_zero: includeZero,
    title,
    filters_label: fl,
    location_columns,
    location_headers,
    rows,
    by_department,
    grand_total,
    grand_qty,
    row_count: rows.length,
    expired_count,
    expiring_soon_count,
    locations,
    categories,
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtMoney(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function fmtQty(n: number): string {
  return Number.isInteger(n)
    ? String(n)
    : n.toFixed(4).replace(/\.?0+$/, "") || "0";
}

export function stockValueReportToCsv(report: StockValueReport): string {
  const lines: string[] = [];
  lines.push([csvEscape(report.title)].join(","));
  lines.push(
    [csvEscape(`As of ${report.as_of}`), csvEscape(report.filters_label)].join(
      ","
    )
  );
  lines.push("");
  const header = [
    "category",
    "product",
    "expiry",
    "status",
    "total_qty",
    "total_value_aed",
    ...report.location_headers.map((h) => h.toLowerCase()),
  ];
  lines.push(header.join(","));
  for (const r of report.rows) {
    lines.push(
      [
        csvEscape(r.category),
        csvEscape(r.product),
        csvEscape(r.expiry || ""),
        csvEscape(r.status),
        csvEscape(fmtQty(r.total_qty)),
        csvEscape(fmtMoney(r.total_value)),
        ...report.location_columns.map((loc) =>
          csvEscape(fmtQty(r.qty_by_location[loc] || 0))
        ),
      ].join(",")
    );
  }
  lines.push("");
  lines.push(
    ["location_subtotal", "header", "sku_lines", "qty_sum", "value_aed"].join(
      ","
    )
  );
  for (const d of report.by_department) {
    lines.push(
      [
        csvEscape(d.department),
        csvEscape(d.header),
        csvEscape(d.line_count),
        csvEscape(fmtQty(d.qty_sum)),
        csvEscape(fmtMoney(d.value_sum)),
      ].join(",")
    );
  }
  lines.push(
    [
      csvEscape("GRAND TOTAL"),
      csvEscape(""),
      csvEscape(report.row_count),
      csvEscape(fmtQty(report.grand_qty)),
      csvEscape(fmtMoney(report.grand_total)),
    ].join(",")
  );
  return lines.join("\n") + "\n";
}
