import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { stockValue, toStockingUnits } from "@/lib/stock-metrics";
import {
  getStockGroup,
  STOCK_GROUP_LABELS,
  type StockGroup,
} from "@/lib/stock-groups";

export const dynamic = "force-dynamic";

const ALERT_STATUSES = [
  "Expired",
  "Expires this month",
  "Expiring ≤90 days",
  "Expiring ≤6 months",
];

const STATUS_ORDER: Record<string, number> = {
  Expired: 1,
  "Expires this month": 2,
  "Expiring ≤90 days": 3,
  "Expiring ≤6 months": 4,
};

type GroupStats = {
  label: string;
  productCount: number;
  totalQty: number;
  totalStockValue: number;
};

function emptyGroup(key: StockGroup): GroupStats {
  return {
    label: STOCK_GROUP_LABELS[key],
    productCount: 0,
    totalQty: 0,
    totalStockValue: 0,
  };
}

export async function GET() {
  const store = await getStore();

  const groups: Record<StockGroup, GroupStats> = {
    products: emptyGroup("products"),
    consumables: emptyGroup("consumables"),
    crash_cart: emptyGroup("crash_cart"),
  };

  let totalProducts = 0;
  let totalQty = 0;
  let totalQtyRaw = 0;
  let totalStockValue = 0;

  for (const p of store.products) {
    const group = getStockGroup(p);
    const qty = toStockingUnits(p.product, p.total);
    const value = stockValue(p.price, p.total);

    groups[group].productCount += 1;
    groups[group].totalQty += qty;
    groups[group].totalStockValue += value;

    totalProducts += 1;
    totalQtyRaw += p.total;
    totalQty += qty;
    totalStockValue += value;
  }

  const expiryAlerts = store.products
    .filter((p) => ALERT_STATUSES.includes(p.status))
    .sort((a, b) => {
      const oa = STATUS_ORDER[a.status] ?? 5;
      const ob = STATUS_ORDER[b.status] ?? 5;
      if (oa !== ob) return oa - ob;
      return a.product.localeCompare(b.product);
    })
    .slice(0, 30);

  const productById = new Map(store.products.map((p) => [p.id, p]));

  const locMap = new Map<string, number>();
  for (const s of store.stock) {
    const p = productById.get(s.product_id);
    const units = toStockingUnits(p?.product ?? "", s.qty);
    locMap.set(s.location, (locMap.get(s.location) || 0) + units);
  }
  const stockByLocation = Array.from(locMap.entries())
    .map(([location, qty]) => ({ location, qty }))
    .sort((a, b) => a.location.localeCompare(b.location));

  const recentActivity = [...store.activity]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 15)
    .map((a) => {
      const p = productById.get(a.product_id);
      return {
        ...a,
        product_name: p?.product,
        barcode: p?.barcode,
      };
    });

  const lowStock = store.products
    .filter((p) => p.total > 0 && p.total < 3)
    .sort((a, b) => a.total - b.total)
    .slice(0, 10);

  return NextResponse.json({
    totalProducts,
    totalQty,
    totalQtyRaw,
    totalStockValue,
    groups,
    expiryAlerts,
    stockByLocation,
    recentActivity,
    lowStock,
  });
}
