import type { StoreData } from "./db";
import { stockValue, toStockingUnits } from "./stock-metrics";
import {
  getStockGroup,
  STOCK_GROUP_LABELS,
  type StockGroup,
} from "./stock-groups";
import { parseDateParam } from "./monthly-staff-report";

export type { StockGroup };

export type StockValueRow = {
  product_id: number;
  product: string;
  category: string;
  department: string;
  /** Stocking units (transducers converted). */
  qty: number;
  /** Raw stored qty used for value. */
  qty_raw: number;
  unit_price: number;
  line_value: number;
  /** Product expiry date string (as stored), or null. */
  expiry: string | null;
  /** Product status (Expired / Expiring… / OK). */
  status: string;
  stock_group: StockGroup;
};

export type DepartmentSubtotal = {
  department: string;
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
  title: string;
  filters_label: string;
  rows: StockValueRow[];
  by_department: DepartmentSubtotal[];
  grand_total: number;
  grand_qty: number;
  row_count: number;
  /** Rows with status Expired. */
  expired_count: number;
  /** Rows expiring this month or within ≤90 days / ≤6 months. */
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
};

const GROUP_QUERY: Record<string, StockGroup> = {
  products: "products",
  consumables: "consumables",
  crash_cart: "crash_cart",
  "crash-cart": "crash_cart",
  crashcart: "crash_cart",
};

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
  return { location, category, stockGroup };
}

function filtersLabel(opts: {
  location: string | null;
  category: string | null;
  stockGroup: StockGroup | null;
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
  return parts.join(" · ");
}

/**
 * Live current stock snapshot (qty, value, expiry — no transaction history).
 * Rows are product × department holdings with qty > 0.
 * Line value = stockValue(price, raw qty); display qty via toStockingUnits.
 * When all filters are All, grand_total matches Home totalStockValue.
 */
export function buildStockValueReport(
  store: StoreData,
  asOf: string,
  filters: StockValueFilterOptions = {}
): StockValueReport {
  const location = (filters.location || "").trim() || null;
  const category = (filters.category || "").trim() || null;
  const stockGroup = filters.stockGroup ?? null;

  const productById = new Map(store.products.map((p) => [p.id, p]));
  const locations = Array.isArray(store.locations)
    ? store.locations.slice()
    : [];
  const categories = [
    ...new Set(store.products.map((p) => p.category).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const rows: StockValueRow[] = [];

  for (const h of store.stock) {
    if (!(h.qty > 0)) continue;
    if (location && h.location !== location) continue;

    const p = productById.get(h.product_id);
    if (!p) continue;
    if (category && p.category !== category) continue;

    const group = getStockGroup(p);
    if (stockGroup && group !== stockGroup) continue;

    const unit_price = p.price ?? 0;
    const line_value = stockValue(p.price, h.qty);
    const qty = toStockingUnits(p.product, h.qty);

    rows.push({
      product_id: p.id,
      product: p.product,
      category: p.category,
      department: h.location,
      qty,
      qty_raw: h.qty,
      unit_price,
      line_value,
      expiry: p.expiry ?? null,
      status: p.status || "OK",
      stock_group: group,
    });
  }

  rows.sort((a, b) => {
    const d = a.department.localeCompare(b.department);
    if (d !== 0) return d;
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    return a.product.localeCompare(b.product);
  });

  const deptMap = new Map<string, DepartmentSubtotal>();
  for (const r of rows) {
    let sub = deptMap.get(r.department);
    if (!sub) {
      sub = {
        department: r.department,
        line_count: 0,
        qty_sum: 0,
        value_sum: 0,
      };
      deptMap.set(r.department, sub);
    }
    sub.line_count += 1;
    sub.qty_sum += r.qty;
    sub.value_sum += r.line_value;
  }
  const by_department = Array.from(deptMap.values()).sort((a, b) =>
    a.department.localeCompare(b.department)
  );

  const grand_total = rows.reduce((s, r) => s + r.line_value, 0);
  const grand_qty = rows.reduce((s, r) => s + r.qty, 0);

  const fl = filtersLabel({ location, category, stockGroup });
  const title = `Clinic Inventory - Current stock report · As of ${asOf} · ${fl}`;

  const expired_count = rows.filter((r) => r.status === "Expired").length;
  const expiring_soon_count = rows.filter(
    (r) =>
      r.status === "Expires this month" ||
      r.status === "Expiring ≤90 days" ||
      r.status === "Expiring ≤6 months"
  ).length;

  return {
    as_of: asOf,
    location,
    category,
    group: stockGroup,
    title,
    filters_label: fl,
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
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, "") || "0";
}

export function stockValueReportToCsv(report: StockValueReport): string {
  const lines: string[] = [];
  lines.push([csvEscape(report.title)].join(","));
  lines.push(
    [
      csvEscape(`As of ${report.as_of}`),
      csvEscape(report.filters_label),
    ].join(",")
  );
  lines.push("");
  const header = [
    "product",
    "category",
    "department",
    "qty",
    "total_value_aed",
    "expiry",
  ];
  lines.push(header.join(","));
  for (const r of report.rows) {
    lines.push(
      [
        csvEscape(r.product),
        csvEscape(r.category),
        csvEscape(r.department),
        csvEscape(fmtQty(r.qty)),
        csvEscape(fmtMoney(r.line_value)),
        csvEscape(r.expiry || ""),
      ].join(",")
    );
  }
  lines.push("");
  lines.push(["department_subtotal", "line_count", "qty_sum", "value_aed"].join(","));
  for (const d of report.by_department) {
    lines.push(
      [
        csvEscape(d.department),
        csvEscape(d.line_count),
        csvEscape(fmtQty(d.qty_sum)),
        csvEscape(fmtMoney(d.value_sum)),
      ].join(",")
    );
  }
  lines.push(
    [
      csvEscape("GRAND TOTAL"),
      csvEscape(report.row_count),
      csvEscape(fmtQty(report.grand_qty)),
      csvEscape(fmtMoney(report.grand_total)),
    ].join(",")
  );
  return lines.join("\n") + "\n";
}
