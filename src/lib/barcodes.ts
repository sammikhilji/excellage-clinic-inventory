/**
 * Map manufacturer GTINs / alternate codes → primary INV-XXXX barcode.
 * Lookup accepts either the INV code or any mapped GTIN.
 */
export const BARCODE_ALIASES: Record<string, string> = {
  // Restylane Vital 1 mL (product INV-0007)
  "07331689121391": "INV-0007",
  "7331689121391": "INV-0007",
};

/** Normalize user/scanner input and resolve aliases to the primary barcode. */
export function resolveBarcode(raw: string): string {
  const trimmed = decodeURIComponent(raw).trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  // Keep numeric GTINs as-is for alias table (keys are digits)
  const digits = trimmed.replace(/\D/g, "");
  if (digits && BARCODE_ALIASES[digits]) {
    return BARCODE_ALIASES[digits];
  }
  if (BARCODE_ALIASES[trimmed]) {
    return BARCODE_ALIASES[trimmed];
  }
  if (BARCODE_ALIASES[upper]) {
    return BARCODE_ALIASES[upper];
  }
  return upper;
}

/** All codes that should match a product (primary + aliases pointing to it). */
export function codesForPrimary(primary: string): string[] {
  const p = primary.toUpperCase();
  const extras = Object.entries(BARCODE_ALIASES)
    .filter(([, v]) => v.toUpperCase() === p)
    .map(([k]) => k);
  return [p, ...extras];
}
