/** Soft colorful chip classes for expiry dates, sized a bit larger for readability. */
export function expiryChipClass(status?: string | null): string {
  const base =
    "inline-flex items-center rounded-lg px-2 py-0.5 font-semibold";
  if (status === "Expired") {
    return `${base} bg-rose-50 text-rose-800 text-base`;
  }
  if (status === "Expires this month") {
    return `${base} bg-orange-50 text-orange-800 text-base`;
  }
  if (status && status.startsWith("Expiring")) {
    return `${base} bg-amber-50 text-amber-800 text-base`;
  }
  // OK / No date / unknown — still colorful amber, slightly larger
  return `${base} bg-amber-50 text-amber-800 text-base`;
}

/** Compact chip for list rows (still bigger than old 10px slate). */
export function expiryChipClassCompact(status?: string | null): string {
  const base =
    "inline-flex items-center rounded-md px-1.5 py-0.5 font-semibold text-xs";
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

/** Parse Mon-YY / Mon-YYYY (e.g. May-28) or ISO-ish dates to a UTC timestamp; null if unknown. */
export function parseExpiryTimestamp(expiry: string | null | undefined): number | null {
  if (!expiry) return null;
  const s = expiry.trim();
  if (!s) return null;

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

/** Near-expiry fallback when no parseable date: lower = sooner / more urgent. */
export const EXPIRY_STATUS_RANK: Record<string, number> = {
  Expired: 0,
  "Expires this month": 1,
  "Expiring ≤90 days": 2,
  "Expiring ≤6 months": 3,
  OK: 4,
  "No date": 5,
};

export function expiryStatusRank(status: string | null | undefined): number {
  if (!status) return 6;
  return EXPIRY_STATUS_RANK[status] ?? 6;
}
