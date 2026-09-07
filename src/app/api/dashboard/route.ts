import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";

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

export async function GET() {
  const store = await getStore();

  const totalProducts = store.products.length;
  const totalQty = store.products.reduce((sum, p) => sum + p.total, 0);

  const expiryAlerts = store.products
    .filter((p) => ALERT_STATUSES.includes(p.status))
    .sort((a, b) => {
      const oa = STATUS_ORDER[a.status] ?? 5;
      const ob = STATUS_ORDER[b.status] ?? 5;
      if (oa !== ob) return oa - ob;
      return a.product.localeCompare(b.product);
    })
    .slice(0, 30);

  const locMap = new Map<string, number>();
  for (const s of store.stock) {
    locMap.set(s.location, (locMap.get(s.location) || 0) + s.qty);
  }
  const stockByLocation = Array.from(locMap.entries())
    .map(([location, qty]) => ({ location, qty }))
    .sort((a, b) => a.location.localeCompare(b.location));

  const productById = new Map(store.products.map((p) => [p.id, p]));
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
    expiryAlerts,
    stockByLocation,
    recentActivity,
    lowStock,
  });
}
