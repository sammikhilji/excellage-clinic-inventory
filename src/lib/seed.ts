import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { LOCATIONS, type Product, type StockHolding, type UnitType } from "./types";

export interface SeedableStore {
  products: Product[];
  stock: StockHolding[];
  activity: unknown[];
  nextIds: { products: number; stock: number; activity: number };
}

const LOCATION_COLS: Record<string, string> = {
  main_store: "Main Store",
  dr_ahmad: "Dr. Ahmad",
  dr_saly: "Dr. Saly",
  dr_niveen: "Dr. Niveen",
  dr_sassani: "Dr. Sassani",
};

function padBarcode(n: number): string {
  return `INV-${String(n).padStart(4, "0")}`;
}

function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function seedStore(store: SeedableStore) {
  const seedPath = path.join(process.cwd(), "data", "seed.csv");
  if (!fs.existsSync(seedPath)) {
    console.warn("seed.csv not found at", seedPath);
    return;
  }

  const raw = fs.readFileSync(seedPath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  const createdAt = nowIso();
  let idx = 1;

  for (const row of records) {
    const category = row.category || "UNCATEGORIZED";
    const productName = row.product || `Product ${idx}`;
    const expiry = row.expiry?.trim() || null;
    const status = row.status || "OK";
    const total = parseFloat(row.total || "0") || 0;
    const unit_type: UnitType = category.toUpperCase().includes("ULTHERA")
      ? "lines"
      : "units";
    const barcode = padBarcode(idx);
    const productId = store.nextIds.products++;

    const product: Product = {
      id: productId,
      barcode,
      category,
      product: productName,
      expiry,
      status,
      unit_type,
      total,
      created_at: createdAt,
    };
    store.products.push(product);

    const seen = new Set<string>();
    for (const [col, loc] of Object.entries(LOCATION_COLS)) {
      const qty = parseFloat(row[col] || "0") || 0;
      const stockId = store.nextIds.stock++;
      const holding: StockHolding = {
        id: stockId,
        product_id: productId,
        location: loc as StockHolding["location"],
        qty,
      };
      store.stock.push(holding);
      seen.add(loc);
    }

    for (const loc of LOCATIONS) {
      if (!seen.has(loc)) {
        const stockId = store.nextIds.stock++;
        store.stock.push({
          id: stockId,
          product_id: productId,
          location: loc,
          qty: 0,
        });
      }
    }

    idx++;
  }

  console.log(`Seeded ${records.length} products`);
}
