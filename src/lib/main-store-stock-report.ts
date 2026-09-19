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

/** Load prev snapshot from store or embedded 17 Sep seed. */
export function getPrevSnapshot(store: StoreData): MainStoreSnapshot {
  const s = store.main_store_report_snapshot;
  if (s && Array.isArray(s.rows) && s.rows.length > 0) {
    return s as MainStoreSnapshot;
  }
  return seedPrev as MainStoreSnapshot;
}

/** Build live location pivot for Products-scope aesthetic items. */
export function livePivot(store: StoreData): Map<string, {
  product: string;
  category: string;
  expiry: string;
  main: number;
  ahmad: number;
  saly: number;
  niveen: number;
  sassani: number;
}> {
  const byId = new Map(store.products.map((p) => [p.id, p]));
  const map = new Map<string, ReturnType<typeof emptyLoc> & {
    product: string; category: string; expiry: string;
  }>();

  for (const h of store.stock) {
    const loc = h.location;
    if (!(loc in LOC_KEY)) continue;
    const p = byId.get(h.product_id);
    if (!p) continue;
    if (getStockGroup(p) === "crash_cart") continue;
    // Products scope for Main Store report: exclude consumables
    if (getStockGroup(p) === "consumables") continue;
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

export function buildMainStoreReport(
  store: StoreData,
  asOfYmd?: string | null
): MainStoreReport {
  const snapshot_date = asOfYmd && /^\d{4}-\d{2}-\d{2}$/.test(asOfYmd) ? asOfYmd : dubaiYmd();
  const snap = parseYmd(snapshot_date);
  const prevSnap = getPrevSnapshot(store);
  const prev_date = prevSnap.snapshot_date || "2026-09-17";
  const prev_label = prevSnap.label || formatLongLabel(prev_date);
  const live = livePivot(store);

  const prevIdx = new Map<string, (typeof prevSnap.rows)[0]>();
  for (const r of prevSnap.rows) {
    prevIdx.set(ALIASES[alnum(r.product)] || alnum(r.product), r);
  }

  const rows: MainStoreSku[] = [];
  const seenLive = new Set<string>();
  const masterOrder = [...prevSnap.rows];

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
    // only aesthetic-ish new
    const g = getStockGroup({ category: now.category, product: now.product } as never);
    if (g !== "products") continue;
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
