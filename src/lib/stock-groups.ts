/** Stocking group for Home dashboard rollups. */
export type StockGroup = "products" | "consumables" | "crash_cart";

export const STOCK_GROUP_LABELS: Record<StockGroup, string> = {
  products: "Products",
  consumables: "Consumables",
  crash_cart: "Crash Cart",
};

/** Categories that count as consumables (case-insensitive exact or includes). */
const CONSUMABLE_CATEGORY_MARKERS = [
  "CONSUMABLES",
  "PHARMACY",
  "HYPODERMIC NEEDLES",
  "CANNULAS / NEEDLES",
  "SYRINGES (LUER)",
  "AESTHETIC / MESO NEEDLES",
  "IV CANNULAS & INFUSION",
  "ACCESSORIES",
  "SECRET TIPS",
  "ULTHERA TRANSDUCERS",
] as const;

const TRANSDUCER_NAME_RE = /transducer/i;

function categoryMatchesConsumable(category: string): boolean {
  const cat = category.trim().toLowerCase();
  if (!cat) return false;
  for (const marker of CONSUMABLE_CATEGORY_MARKERS) {
    const m = marker.toLowerCase();
    if (cat === m || cat.includes(m)) return true;
  }
  return false;
}

/**
 * Classify a product into a stocking group.
 * Order: crash_cart → consumables → products (default).
 */
export function getStockGroup(product: {
  category?: string | null;
  product?: string | null;
}): StockGroup {
  const category = (product.category ?? "").trim();
  const name = product.product ?? "";

  const catLower = category.toLowerCase();
  if (
    catLower.startsWith("crash cart") ||
    catLower === "crash cart medication"
  ) {
    return "crash_cart";
  }

  if (categoryMatchesConsumable(category) || TRANSDUCER_NAME_RE.test(name)) {
    return "consumables";
  }

  return "products";
}
