/**
 * Map manufacturer GTINs / alternate codes → primary INV-XXXX barcode.
 * Lookup accepts INV code, GTIN, GS1 Data Matrix, or QR sticker payloads.
 *
 * Photo packages (Restylane Skinboosters):
 * - Vital Lidocaine / Restylane Vital 1 mL → INV-0007
 * - Restylane Vital Light 1 mL → INV-0008 (seed name match)
 */
export const BARCODE_ALIASES: Record<string, string> = {
  // Restylane Vital 1 mL / Vital Lidocaine (product INV-0007)
  "07331689121391": "INV-0007",
  "7331689121391": "INV-0007",
  // Restylane Skinboosters Vital Light 1 mL (INV-0008 when seeded by row order)
  "07331689120523": "INV-0008",
  "7331689120523": "INV-0008",
};

export type ParsedScan = {
  raw: string;
  gtin: string | null;
  /** Expiry YYYY-MM-DD from AI (17) YYMMDD when present */
  expiry: string | null;
  /** Lot / batch from AI (10) when present */
  lot: string | null;
  candidates: string[];
};

function yymmddToIso(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = parseInt(yymmdd.slice(2, 4), 10);
  const dd = parseInt(yymmdd.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const yyyy = yy >= 80 ? 1900 + yy : 2000 + yy;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Parse GS1 Data Matrix / QR payloads and plain GTINs / unique sticker codes.
 * Handles (01)/(17)/(10) parenthesized AIs and concatenated element strings.
 */
export function parseScanPayload(rawInput: string): ParsedScan {
  let raw = "";
  try {
    raw = decodeURIComponent(String(rawInput || "")).trim();
  } catch {
    raw = String(rawInput || "").trim();
  }
  if (!raw) {
    return { raw: "", gtin: null, expiry: null, lot: null, candidates: [] };
  }

  let gtin: string | null = null;
  let expiry: string | null = null;
  let lot: string | null = null;

  const paren01 = raw.match(/\(01\)\s*(\d{8,14})/i);
  if (paren01) gtin = paren01[1].padStart(14, "0").slice(-14);

  const paren17 = raw.match(/\(17\)\s*(\d{6})/i);
  if (paren17) expiry = yymmddToIso(paren17[1]);

  const paren10 = raw.match(/\(10\)\s*([^\s(]+)/i);
  if (paren10) lot = paren10[1].trim() || null;

  const stripped = raw.replace(/[()]/g, "");
  const digitsOnly = stripped.replace(/\D/g, "");

  if (!gtin) {
    if (/^01\d{14}/.test(digitsOnly)) {
      gtin = digitsOnly.slice(2, 16);
    } else {
      const m01 = /(?:^|[^0-9])01(\d{14})/.exec(` ${stripped}`);
      if (m01) gtin = m01[1];
      else if (/^\d{13,14}$/.test(digitsOnly)) {
        gtin = digitsOnly.padStart(14, "0").slice(-14);
      }
    }
  }

  // After 01+GTIN: optional 17YYMMDD then 10LOT (alphanumeric lot allowed)
  if (gtin) {
    const prefix = "01" + gtin;
    let rest = stripped;
    const at = stripped.indexOf(prefix);
    if (at >= 0) rest = stripped.slice(at + prefix.length);
    else if (stripped.includes(gtin)) {
      rest = stripped.slice(stripped.indexOf(gtin) + gtin.length);
    }

    if (!expiry) {
      const m17 = /^17(\d{6})/.exec(rest);
      if (m17) {
        expiry = yymmddToIso(m17[1]);
        rest = rest.slice(8);
      }
    } else {
      rest = rest.replace(/^17\d{6}/, "");
    }

    if (!lot) {
      const m10 = /^10(.+)$/.exec(rest);
      if (m10) {
        lot = m10[1].split(/[\x1d\s]/)[0] || null;
      }
    }
  }

  if (!expiry) {
    const m17 = /(?:^|[^0-9])17(\d{6})/.exec(` ${stripped}`);
    if (m17) expiry = yymmddToIso(m17[1]);
  }
  if (!lot) {
    const t = stripped.match(/(?:^|[^0-9])10([A-Za-z0-9][A-Za-z0-9\-]*)\s*$/);
    if (t && t[1].length <= 20) lot = t[1];
  }

  const upper = raw.toUpperCase();
  const candidates: string[] = [];
  const add = (c: string | null | undefined) => {
    if (!c) return;
    const t = c.trim();
    if (!t) return;
    if (!candidates.includes(t)) candidates.push(t);
    const d = t.replace(/\D/g, "");
    if (d && d !== t && !candidates.includes(d)) candidates.push(d);
    const u = t.toUpperCase();
    if (u !== t && !candidates.includes(u)) candidates.push(u);
  };

  add(gtin);
  if (gtin) add(gtin.replace(/^0+/, "") || gtin);
  if (digitsOnly.length >= 8 && digitsOnly.length <= 14) add(digitsOnly);
  add(raw);
  add(upper);
  add(stripped);

  return { raw, gtin, expiry, lot, candidates };
}

function aliasLookup(code: string): string | null {
  if (!code) return null;
  if (BARCODE_ALIASES[code]) return BARCODE_ALIASES[code].toUpperCase();
  const upper = code.toUpperCase();
  if (BARCODE_ALIASES[upper]) return BARCODE_ALIASES[upper].toUpperCase();
  const digits = code.replace(/\D/g, "");
  if (digits && BARCODE_ALIASES[digits]) {
    return BARCODE_ALIASES[digits].toUpperCase();
  }
  return null;
}

/** Resolve hardcoded aliases only (no store). */
export function resolveBarcode(raw: string): string {
  const parsed = parseScanPayload(raw);
  if (!parsed.raw) return "";

  for (const c of parsed.candidates) {
    const hit = aliasLookup(c);
    if (hit) return hit;
  }

  if (/^INV-\d+$/i.test(parsed.raw.trim())) {
    return parsed.raw.trim().toUpperCase();
  }

  if (parsed.gtin) return parsed.gtin.toUpperCase();
  return parsed.raw.toUpperCase();
}

export type ProductBarcodeFields = {
  id?: number;
  barcode: string;
  barcode_aliases?: string[] | null;
};

export function codesForPrimary(
  primary: string,
  product?: ProductBarcodeFields | null
): string[] {
  const p = primary.toUpperCase();
  const extras = Object.entries(BARCODE_ALIASES)
    .filter(([, v]) => v.toUpperCase() === p)
    .map(([k]) => k);
  const storeAliases = (product?.barcode_aliases || []).map(String);
  const out: string[] = [];
  for (const c of [p, ...extras, ...storeAliases]) {
    const t = String(c).trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function productMatchesCandidate(
  p: ProductBarcodeFields,
  candidate: string
): boolean {
  const cu = candidate.toUpperCase();
  const cd = candidate.replace(/\D/g, "");
  if (p.barcode.toUpperCase() === cu) return true;
  if (cd && p.barcode.replace(/\D/g, "") === cd && cd.length >= 8) return true;
  for (const a of p.barcode_aliases || []) {
    const au = String(a).toUpperCase();
    const ad = String(a).replace(/\D/g, "");
    if (au === cu) return true;
    if (cd && ad && ad === cd) return true;
  }
  return false;
}

/** Resolve using hardcoded aliases + per-product barcode_aliases. */
export function resolveBarcodeWithStore(
  raw: string,
  products: ProductBarcodeFields[]
): string {
  const parsed = parseScanPayload(raw);
  if (!parsed.raw) return "";

  for (const c of parsed.candidates) {
    for (const p of products) {
      if (productMatchesCandidate(p, c)) return p.barcode.toUpperCase();
    }
  }

  const hardcoded = resolveBarcode(raw);
  if (/^INV-\d+$/i.test(hardcoded)) {
    const hit = products.find((p) => p.barcode.toUpperCase() === hardcoded);
    if (hit) return hit.barcode.toUpperCase();
    return hardcoded;
  }
  return hardcoded;
}

export function findProductByScan<T extends ProductBarcodeFields>(
  products: T[],
  raw: string
): T | undefined {
  const primary = resolveBarcodeWithStore(raw, products);
  if (!primary) return undefined;

  const byPrimary = products.find((p) => p.barcode.toUpperCase() === primary);
  if (byPrimary) return byPrimary;

  const parsed = parseScanPayload(raw);
  for (const c of parsed.candidates) {
    for (const p of products) {
      if (productMatchesCandidate(p, c)) return p;
    }
  }
  return undefined;
}

/** Normalize a unique package code for barcode_aliases storage. */
export function normalizeAliasCode(raw: string): string {
  const parsed = parseScanPayload(raw);
  if (parsed.gtin) return parsed.gtin;
  const trimmed = parsed.raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (/^\d{8,14}$/.test(digits)) {
    return digits.length >= 13 ? digits.padStart(14, "0").slice(-14) : digits;
  }
  return trimmed;
}

export function codeOwnedByOther(
  products: ProductBarcodeFields[],
  code: string,
  exceptProductId?: number
): ProductBarcodeFields | undefined {
  const norm = normalizeAliasCode(code);
  const candidates = [norm, norm.toUpperCase(), norm.replace(/\D/g, "")].filter(
    Boolean
  );
  for (const p of products) {
    if (exceptProductId != null && p.id === exceptProductId) continue;
    for (const c of candidates) {
      if (productMatchesCandidate(p, c)) return p;
    }
  }
  return undefined;
}
