/**
 * Main Store Stock Report — aesthetic injectables master + live qty merge.
 * Status is Normal (never OK). Prev snapshot for consumption comparison.
 */
import type { StoreData } from "./db";
import { getStockGroup } from "./stock-groups";
import seedPrev from "../data/main-store-prev-seed-2026-09-17.json";

export const MAIN_LOCS = [
  "Main Store",
  "Dr. Ahmad",
  "Dr. Saly",
  "Dr. Niveen",
  "Dr. Sassani",
] as const;

export type LocKey = "main" | "ahmad" | "saly" | "niveen" | "sassani";

export const LOC_KEY: Record<(typeof MAIN_LOCS)[number], LocKey> = {
  "Main Store": "main",
  "Dr. Ahmad": "ahmad",
  "Dr. Saly": "saly",
  "Dr. Niveen": "niveen",
  "Dr. Sassani": "sassani",
};

export type MainStoreSku = {
  product: string;
  category: string;
  category_long: string;
  expiry: string;
  status: string;
  main: number;
  ahmad: number;
  saly: number;
  niveen: number;
  sassani: number;
  total: number;
  prev_main: number;
  prev_ahmad: number;
  prev_saly: number;
  prev_niveen: number;
  prev_sassani: number;
  prev_total: number;
  used: number;
  receipt: number;
  is_transducer: boolean;
};

export type MainStoreSnapshot = {
  snapshot_date: string;
  label: string;
  rows: Array<{
    product: string;
    category?: string;
    category_long?: string;
    expiry?: string;
    main: number;
    ahmad: number;
    saly: number;
    niveen: number;
    sassani: number;
    total: number;
  }>;
};

export type MainStoreReport = {
  snapshot_date: string;
  snapshot_label: string;
  prev_date: string;
  prev_label: string;
  rows: MainStoreSku[];
  new_skus: string[];
  units_now: number;
  units_prev: number;
  used_total: number;
  receipt_total: number;
  sku_n: number;
  in_stock: number;
  oos: number;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function alnum(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[—–]/g, "-")
    .replace(/[^a-z0-9]/g, "");
}

export function fmtQty(v: number): string {
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(Number(v.toFixed(4)).toString());
}

export function parseExpiryEnd(exp: string | null | undefined, snap: Date): Date | null {
  if (!exp) return null;
  const e = exp.trim();
  if (!e || e === "—" || e === "-" || e === "–") return null;
  if (/^\d+\s*M$/i.test(e)) return null;
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(e);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return null;
  const year = 2000 + parseInt(m[2], 10);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return new Date(Date.UTC(year, mon - 1, last));
}

/** Report status — Normal never OK. */
export function computeReportStatus(exp: string | null | undefined, snap: Date): string {
  const end = parseExpiryEnd(exp, snap);
  if (!end) return "No date";
  const sy = snap.getUTCFullYear();
  const sm = snap.getUTCMonth();
  if (end.getUTCFullYear() === sy && end.getUTCMonth() === sm) return "Expires this month";
  const monthStart = Date.UTC(sy, sm, 1);
  if (end.getTime() < monthStart) return "Expired";
  const days = Math.floor((end.getTime() - Date.UTC(sy, sm, snap.getUTCDate())) / 86400000);
  if (days < 0) return "Expired";
  if (days <= 90) return "Expiring ≤90 days";
  if (days <= 183) return "Expiring ≤6 months";
  return "Normal";
}

export function isTransducerSku(category: string, product: string): boolean {
  const c = `${category} ${product}`.toLowerCase();
  return c.includes("ulthera") || c.includes("transducer");
}

function dubaiYmd(d = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatLongLabel(ymd: string): string {
  const dt = parseYmd(ymd);
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

const ALIASES: Record<string, string> = {
  [alnum("ISDIN ACNIIBEN FACIAL CLEANSER GEL 400 mL")]: alnum(
    "ISDIN Acniben Facial Cleanser Gel 400 mL"
  ),
  [alnum("ISDIN UREADIN ULTRA 10 REPAIRING LOTION")]: alnum(
    "ISDIN Ureadin Ultra 10 Repairing Lotion"
  ),
};

function emptyLoc() {
  return { main: 0, ahmad: 0, saly: 0, niveen: 0, sassani: 0 };
}

export type MainStoreReportOptions = {
  /** Previous count date (prev_date). */
  from?: string | null;
  /** Current snapshot date (snapshot_date / To). */
  to?: string | null;
  /** @deprecated Prefer `to`. */
  date?: string | null;
  category?: string | null;
  /** products | consumables | crash_cart | empty = all non-crash default products */
  group?: string | null;
  location?: string | null;
};

function isYmd(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function daysApart(a: string, b: string): number {
  const da = parseYmd(a).getTime();
  const db = parseYmd(b).getTime();
  return Math.round(Math.abs(da - db) / 86400000);
}

/** Load prev snapshot for a From date: exact store match → seeded 17 Sep ≈ → last saved → seed. */
export function getPrevSnapshot(
  store: StoreData,
  fromYmd?: string | null
): MainStoreSnapshot {
  const s = store.main_store_report_snapshot;
  const hasStore =
    !!s && Array.isArray(s.rows) && s.rows.length > 0
      ? (s as MainStoreSnapshot)
      : null;
  const seed = seedPrev as MainStoreSnapshot;

  if (isYmd(fromYmd)) {
    if (hasStore && hasStore.snapshot_date === fromYmd) {
      return hasStore;
    }
    if (fromYmd === "2026-09-17" || daysApart(fromYmd, "2026-09-17") <= 1) {
      return {
        ...seed,
        snapshot_date: fromYmd,
        label: formatLongLabel(fromYmd),
      };
    }
    if (hasStore) return hasStore;
    return seed;
  }

  if (hasStore) return hasStore;
  return seed;
}

/** Build live location pivot; default scope = products (excludes consumables + crash cart). */
export function livePivot(
  store: StoreData,
  opts?: { group?: string | null; category?: string | null }
): Map<string, {
  product: string;
  category: string;
  expiry: string;
  main: number;
  ahmad: number;
  saly: number;
  niveen: number;
  sassani: number;
}> {
  const group = (opts?.group ?? "products").trim().toLowerCase();
  const categoryFilter = (opts?.category ?? "").trim().toLowerCase();
  const byId = new Map(store.products.map((p) => [p.id, p]));
  const map = new Map<string, ReturnType<typeof emptyLoc> & {
    product: string; category: string; expiry: string;
  }>();

  for (const h of store.stock) {
    const loc = h.location;
    if (!(loc in LOC_KEY)) continue;
    const p = byId.get(h.product_id);
    if (!p) continue;
    const g = getStockGroup(p);
    if (group === "products") {
      if (g === "crash_cart" || g === "consumables") continue;
    } else if (group === "consumables") {
      if (g !== "consumables") continue;
    } else if (group === "crash_cart") {
      if (g !== "crash_cart") continue;
    }
    // group === "" → all
    if (categoryFilter) {
      const cat = (p.category || "").trim().toLowerCase();
      if (cat !== categoryFilter) continue;
    }
    const key = alnum(p.product);
    let row = map.get(key);
    if (!row) {
      row = {
        product: p.product,
        category: p.category,
        expiry: p.expiry || "",
        ...emptyLoc(),
      };
      map.set(key, row);
    }
    const k = LOC_KEY[loc as keyof typeof LOC_KEY];
    row[k] += Number(h.qty) || 0;
    if (p.expiry) row.expiry = p.expiry;
  }
  return map;
}

function normalizeOpts(
  asOfOrOpts?: string | null | MainStoreReportOptions
): MainStoreReportOptions {
  if (asOfOrOpts == null || typeof asOfOrOpts === "string") {
    return { to: asOfOrOpts ?? null, from: null };
  }
  return asOfOrOpts;
}

export function buildMainStoreReport(
  store: StoreData,
  asOfOrOpts?: string | null | MainStoreReportOptions
): MainStoreReport {
  const opts = normalizeOpts(asOfOrOpts);
  const toRaw = opts.to ?? opts.date ?? null;
  const fromRaw = opts.from ?? null;
  const snapshot_date = isYmd(toRaw) ? toRaw : dubaiYmd();
  const snap = parseYmd(snapshot_date);
  const prevSnap = getPrevSnapshot(store, fromRaw);
  const prev_date = isYmd(fromRaw)
    ? fromRaw
    : prevSnap.snapshot_date || "2026-09-17";
  const prev_label = formatLongLabel(prev_date);
  const live = livePivot(store, {
    group: opts.group ?? "products",
    category: opts.category ?? null,
  });
  const locationFilter = (opts.location ?? "").trim();
  const locKeyFilter =
    locationFilter && locationFilter in LOC_KEY
      ? LOC_KEY[locationFilter as keyof typeof LOC_KEY]
      : null;

  const groupOpt = (opts.group ?? "products").trim().toLowerCase();
  const useMasterPrev = groupOpt === "products" || groupOpt === "";

  const prevIdx = new Map<string, (typeof prevSnap.rows)[0]>();
  for (const r of prevSnap.rows) {
    prevIdx.set(ALIASES[alnum(r.product)] || alnum(r.product), r);
  }

  const rows: MainStoreSku[] = [];
  const seenLive = new Set<string>();
  const masterOrder = useMasterPrev ? [...prevSnap.rows] : [];

  for (const prev of masterOrder) {
    const key = ALIASES[alnum(prev.product)] || alnum(prev.product);
    const now = live.get(key) || [...live.entries()].find(([k]) => k.includes(key) || key.includes(k))?.[1];
    if (now) seenLive.add(alnum(now.product));

    const cat = prev.category_long || prev.category || now?.category || "";
    const shortCat = prev.category || cat;
    const is_t = isTransducerSku(cat, prev.product);
    const keepPrevQty = !now && (is_t || /secret tips/i.test(cat) || /secret tips/i.test(shortCat));

    const locs = keepPrevQty
      ? {
          main: prev.main, ahmad: prev.ahmad, saly: prev.saly,
          niveen: prev.niveen, sassani: prev.sassani,
        }
      : now
        ? {
            main: now.main, ahmad: now.ahmad, saly: now.saly,
            niveen: now.niveen, sassani: now.sassani,
          }
        : emptyLoc();

    const total = locs.main + locs.ahmad + locs.saly + locs.niveen + locs.sassani;
    const expiry = (now?.expiry && /^[A-Za-z]{3}-\d{2}$/.test(now.expiry) ? now.expiry : prev.expiry) || "—";
    const prev_total = prev.total ?? (prev.main + prev.ahmad + prev.saly + prev.niveen + prev.sassani);

    rows.push({
      product: prev.product,
      category: shortCat,
      category_long: cat,
      expiry: expiry === "-" ? "—" : expiry,
      status: computeReportStatus(expiry, snap),
      ...locs,
      total,
      prev_main: prev.main,
      prev_ahmad: prev.ahmad,
      prev_saly: prev.saly,
      prev_niveen: prev.niveen,
      prev_sassani: prev.sassani,
      prev_total,
      used: Math.max(0, prev_total - total),
      receipt: Math.max(0, total - prev_total),
      is_transducer: is_t,
    });
  }

  const new_skus: string[] = [];
  for (const [key, now] of live) {
    if (seenLive.has(alnum(now.product)) || seenLive.has(key)) continue;
    if (prevIdx.has(key) || prevIdx.has(ALIASES[key] || key)) continue;
    const g = getStockGroup({ category: now.category, product: now.product } as never);
    if (groupOpt === "products" && g !== "products") continue;
    if (groupOpt === "consumables" && g !== "consumables") continue;
    if (groupOpt === "crash_cart" && g !== "crash_cart") continue;
    const total = now.main + now.ahmad + now.saly + now.niveen + now.sassani;
    new_skus.push(now.product);
    rows.push({
      product: now.product,
      category: now.category,
      category_long: now.category,
      expiry: now.expiry || "—",
      status: computeReportStatus(now.expiry, snap),
      main: now.main, ahmad: now.ahmad, saly: now.saly, niveen: now.niveen, sassani: now.sassani,
      total,
      prev_main: 0, prev_ahmad: 0, prev_saly: 0, prev_niveen: 0, prev_sassani: 0, prev_total: 0,
      used: 0, receipt: total,
      is_transducer: isTransducerSku(now.category, now.product),
    });
  }

  let filtered = rows;
  if (locKeyFilter) {
    filtered = rows.filter((r) => (r[locKeyFilter] ?? 0) > 0);
  }
  if ((opts.category ?? "").trim()) {
    const cf = (opts.category ?? "").trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        (r.category || "").trim().toLowerCase() === cf ||
        (r.category_long || "").trim().toLowerCase() === cf
    );
  }
  // Replace rows with filtered for report output
  rows.length = 0;
  rows.push(...filtered);

  const nonT = rows.filter((r) => !r.is_transducer);
  const units_now = nonT.reduce((s, r) => s + r.total, 0);
  const units_prev = nonT.reduce((s, r) => s + r.prev_total, 0);
  const used_total = nonT.reduce((s, r) => s + r.used, 0);
  const receipt_total = nonT.reduce((s, r) => s + r.receipt, 0);

  return {
    snapshot_date,
    snapshot_label: formatLongLabel(snapshot_date),
    prev_date,
    prev_label,
    rows,
    new_skus,
    units_now,
    units_prev,
    used_total,
    receipt_total,
    sku_n: rows.length,
    in_stock: rows.filter((r) => r.total > 0).length,
    oos: rows.filter((r) => r.total <= 0).length,
  };
}

/** Snapshot payload to persist after generate. */
export function snapshotFromReport(report: MainStoreReport): MainStoreSnapshot {
  return {
    snapshot_date: report.snapshot_date,
    label: report.snapshot_label,
    rows: report.rows.map((r) => ({
      product: r.product,
      category: r.category,
      category_long: r.category_long,
      expiry: r.expiry,
      main: r.main,
      ahmad: r.ahmad,
      saly: r.saly,
      niveen: r.niveen,
      sassani: r.sassani,
      total: r.total,
    })),
  };
}

export function mainStoreReportToCsv(report: MainStoreReport): string {
  const headers = [
    "category","product","expiry","status","total","main","ahmad","saly","niveen","sassani",
    "prev_total","used","receipt",
  ];
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of report.rows) {
    lines.push([
      r.category_long, r.product, r.expiry, r.status, r.total,
      r.main, r.ahmad, r.saly, r.niveen, r.sassani,
      r.prev_total, r.used, r.receipt,
    ].map(esc).join(","));
  }
  return lines.join("\n");
}

/** Excel export — same inventory columns as PDF pages + Used / Receipt. */
export async function mainStoreReportToXlsx(
  report: MainStoreReport
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Clinic Inventory";
  wb.created = new Date();
  wb.description = `Main Store Stock Report ${report.prev_date} → ${report.snapshot_date}`;

  const PURPLE = "5C2D91";
  const ZEBRA = "F5F5F7";

  const meta = wb.addWorksheet("Summary");
  meta.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 48 },
  ];
  const metaRows: Array<[string, string | number]> = [
    ["Report", "Main Store Stock Report"],
    ["From (previous count)", report.prev_date],
    ["From label", report.prev_label],
    ["To (snapshot)", report.snapshot_date],
    ["To label", report.snapshot_label],
    ["SKU lines", report.sku_n],
    ["In stock", report.in_stock],
    ["Out of stock", report.oos],
    ["Units now (excl. transducers)", report.units_now],
    ["Units prev (excl. transducers)", report.units_prev],
    ["Used total", report.used_total],
    ["Receipt total", report.receipt_total],
  ];
  for (const [field, value] of metaRows) {
    meta.addRow({ field, value });
  }
  const mh = meta.getRow(1);
  mh.font = { bold: true, color: { argb: "FFFFFFFF" } };
  mh.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${PURPLE}` },
  };

  const sheet = wb.addWorksheet("Inventory", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Category", key: "category", width: 22 },
    { header: "Product", key: "product", width: 36 },
    { header: "Expiry", key: "expiry", width: 10 },
    { header: "Status", key: "status", width: 18 },
    { header: "Total", key: "total", width: 10 },
    { header: "Main", key: "main", width: 10 },
    { header: "Ahmad", key: "ahmad", width: 10 },
    { header: "Saly", key: "saly", width: 10 },
    { header: "Niveen", key: "niveen", width: 10 },
    { header: "Sassani", key: "sassani", width: 10 },
    { header: "Used", key: "used", width: 10 },
    { header: "Receipt", key: "receipt", width: 10 },
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

  for (const r of report.rows) {
    const row = sheet.addRow({
      category: r.category_long || r.category,
      product: r.product,
      expiry: r.expiry,
      status: r.status,
      total: r.total,
      main: r.main,
      ahmad: r.ahmad,
      saly: r.saly,
      niveen: r.niveen,
      sassani: r.sassani,
      used: r.used,
      receipt: r.receipt,
    });
    if (row.number % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${ZEBRA}` },
      };
    }
    for (const k of [
      "total",
      "main",
      "ahmad",
      "saly",
      "niveen",
      "sassani",
      "used",
      "receipt",
    ] as const) {
      row.getCell(k).alignment = { horizontal: "right" };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
