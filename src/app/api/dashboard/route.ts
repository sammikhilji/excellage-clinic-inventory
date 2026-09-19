import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { stockValue, toStockingUnits } from "@/lib/stock-metrics";
import {
  getStockGroup,
  STOCK_GROUP_LABELS,
  type StockGroup,
} from "@/lib/stock-groups";
import {
  computeExpiryFieldStatus,
  EXPIRY_ALERT_STATUSES,
  expiryStatusRank,
  nowInDubai,
} from "@/lib/expiry-display";

export const dynamic = "force-dynamic";

const ALERT_SET = new Set<string>(EXPIRY_ALERT_STATUSES);

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
  const now = nowInDubai();

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

  // Compute expiry urgency from the date field (stored status is often stale "OK").
  const expiryAlerts = store.products
    .map((p) => {
      const expiryStatus = computeExpiryFieldStatus(p.expiry, now);
      return { ...p, status: expiryStatus, expiryStatus };
    })
    .filter((p) => {
      if (!ALERT_SET.has(p.status)) return false;
      // Prefer in-stock; also surface expired rows even if qty is 0.
      if (p.total > 0) return true;
      return p.status === "Expired";
    })
    .sort((a, b) => {
      const oa = expiryStatusRank(a.status);
      const ob = expiryStatusRank(b.status);
      if (oa !== ob) return oa - ob;
      // In-stock before OOS within the same urgency bucket
      if ((a.total > 0) !== (b.total > 0)) return a.total > 0 ? -1 : 1;
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
