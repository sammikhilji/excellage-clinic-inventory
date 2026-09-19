/** Ultherapy transducers are stored as raw line counts; one stocking unit = this many lines. */
export const TRANSDUCER_LINES_PER_UNIT = 2400;

const TRANSDUCER_RE = /transducer/i;

/** True when the product name indicates a transducer (case-insensitive). */
export function isTransducerProduct(productName: string): boolean {
  return TRANSDUCER_RE.test(productName);
}

/**
 * Convert stored quantity to dashboard stocking units.
 * Transducers: stored lines ÷ TRANSDUCER_LINES_PER_UNIT; everything else: stored qty as-is.
 */
export function toStockingUnits(productName: string, storedQty: number): number {
  if (isTransducerProduct(productName)) {
    return storedQty / TRANSDUCER_LINES_PER_UNIT;
  }
  return storedQty;
}

/** Stock value in currency units: (price ?? 0) × stored quantity (raw lines for transducers). */
export function stockValue(
  price: number | null | undefined,
  storedQty: number
): number {
  return (price ?? 0) * storedQty;
}
