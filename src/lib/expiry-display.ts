/** Soft colorful chip classes for expiry dates, sized a bit larger for readability. */

/** Period After Opening (PAO) shelf-life codes: 3M, 6M, 12M, 18M, etc. */
export function isPaoCode(expiry: string | null | undefined): boolean {
  if (!expiry) return false;
  return /^\d+\s*M$/i.test(expiry.trim());
}

/** Normalize PAO display e.g. "6 M" → "6M". */
export function normalizePaoCode(expiry: string): string {
  const m = /^(\d+)\s*M$/i.exec(expiry.trim());
  return m ? `${m[1]}M` : expiry.trim();
}

/**
 * Chip label for product.expiry.
 * PAO → "After opening: 6M" (not "Expiry: 6M").
 */
export function formatExpiryChipLabel(
  expiry: string,
  opts?: { compact?: boolean }
): string {
  const compact = opts?.compact === true;
  const e = expiry.trim();
  if (isPaoCode(e)) {
    const code = normalizePaoCode(e);
    return compact ? `After opening ${code}` : `After opening: ${code}`;
  }
  return compact ? `Exp ${e}` : `Expiry: ${e}`;
}

/**
 * Chip colors for expiry UI.
 * PAO / No date / After opening → neutral slate (never amber/red warning).
 * Calendar warning statuses keep rose/orange/amber.
 */
export function expiryChipClass(
  status?: string | null,
  expiry?: string | null
): string {
  const base =
    "inline-flex items-center rounded-lg px-2 py-0.5 font-semibold";
  if (isPaoCode(expiry) || status === "No date" || status === "After opening") {
    return `${base} bg-slate-100 text-slate-600 text-base`;
  }
  if (status === "Expired") {
    return `${base} bg-rose-50 text-rose-800 text-base`;
  }
  if (status === "Expires this month") {
    return `${base} bg-orange-50 text-orange-800 text-base`;
  }
  if (status && status.startsWith("Expiring")) {
    return `${base} bg-amber-50 text-amber-800 text-base`;
  }
  // Calendar date with OK / unknown — soft amber highlight (not a warning status)
  return `${base} bg-amber-50 text-amber-800 text-base`;
}

/** Compact chip for list rows (still bigger than old 10px slate). */
export function expiryChipClassCompact(
  status?: string | null,
  expiry?: string | null
): string {
  const base =
    "inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold text-xs";
  if (isPaoCode(expiry) || status === "No date" || status === "After opening") {
    return `${base} bg-slate-100 text-slate-600`;
  }
  if (status === "Expired") {
    return `${base} bg-rose-50 text-rose-800`;
  }
  if (status === "Expires this month") {
    return `${base} bg-orange-50 text-orange-800`;
  }
  if (status && status.startsWith("Expiring")) {
    return `${base} bg-amber-50 text-amber-800`;
  }
  return `${base} bg-amber-50 text-amber-800`;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Parse Mon-YY / Mon-YYYY (e.g. May-28) or ISO-ish dates to a UTC timestamp; null if unknown.
 * PAO codes (6M etc.) are never treated as calendar months.
 */
export function parseExpiryTimestamp(expiry: string | null | undefined): number | null {
  if (!expiry) return null;
  const s = expiry.trim();
  if (!s) return null;
  if (isPaoCode(s)) return null;

  const monYy = /^([A-Za-z]{3})[-\s/](\d{2}|\d{4})$/.exec(s);
  if (monYy) {
    const month = MONTH_INDEX[monYy[1].toLowerCase()];
    if (month == null) return null;
    let year = parseInt(monYy[2], 10);
    if (year < 100) year += 2000;
    return Date.UTC(year, month, 1);
  }

  // ISO date (YYYY-MM-DD) or other Date-parseable forms
  if (/^\d{4}-\d{2}/.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;
  }

  return null;
}

/**
 * UI / report expiry status from the expiry field alone.
 * PAO → "No date" (never Expired / Expiring… from parsing 6M as a month).
 * Prefer this when computing calendar urgency; stock OK stays separate.
 */
export function computeExpiryFieldStatus(
  expiry: string | null | undefined,
  now: Date = new Date()
): string {
  if (!expiry || !expiry.trim()) return "No date";
  const s = expiry.trim();
  if (isPaoCode(s)) return "No date";
  if (s === "—" || s === "-" || s === "–") return "No date";

  const ts = parseExpiryTimestamp(s);
  if (ts == null) return "No date";

  const end = new Date(ts);
  // Treat Mon-YY as month-end for urgency (align with Main Store report)
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();
  const lastDay = new Date(Date.UTC(endY, endM + 1, 0)).getUTCDate();
  const endMs = Date.UTC(endY, endM, lastDay);

  const sy = now.getUTCFullYear();
  const sm = now.getUTCMonth();
  const sd = now.getUTCDate();
  if (endY === sy && endM === sm) return "Expires this month";
  const monthStart = Date.UTC(sy, sm, 1);
  if (endMs < monthStart) return "Expired";
  const days = Math.floor((endMs - Date.UTC(sy, sm, sd)) / 86400000);
  if (days < 0) return "Expired";
  if (days <= 90) return "Expiring ≤90 days";
  if (days <= 183) return "Expiring ≤6 months";
  return "OK";
}

/** Near-expiry fallback when no parseable date: lower = sooner / more urgent. */
export const EXPIRY_STATUS_RANK: Record<string, number> = {
  Expired: 0,
  "Expires this month": 1,
  "Expiring ≤90 days": 2,
  "Expiring ≤6 months": 3,
  OK: 4,
  "No date": 5,
  "After opening": 5,
};

export function expiryStatusRank(status: string | null | undefined): number {
  if (!status) return 6;
  return EXPIRY_STATUS_RANK[status] ?? 6;
}

/** Calendar "today" as UTC Date whose Y/M/D match Asia/Dubai (for expiry math). */
export function nowInDubai(d: Date = new Date()): Date {
  try {
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const [y, m, day] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day));
  } catch {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
}

export const EXPIRY_ALERT_STATUSES = [
  "Expired",
  "Expires this month",
  "Expiring ≤90 days",
  "Expiring ≤6 months",
] as const;

export type ExpiryAlertStatus = (typeof EXPIRY_ALERT_STATUSES)[number];

export function isExpiryAlertStatus(status: string): status is ExpiryAlertStatus {
  return (EXPIRY_ALERT_STATUSES as readonly string[]).includes(status);
}

/**
 * Badge / list status at read time.
 * OUT OF STOCK wins when total <= 0. PAO "After opening" preserved.
 * Otherwise recompute from expiry (never trust stale stored "OK").
 */
export function displayProductStatus(
  p: { status?: string | null; expiry?: string | null; total?: number | null },
  now: Date = nowInDubai()
): string {
  if ((p.total ?? 0) <= 0) return "OUT OF STOCK";
  if (isPaoCode(p.expiry) && p.status === "After opening") return "After opening";
  return computeExpiryFieldStatus(p.expiry, now);
}

