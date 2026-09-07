import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const store = await getStore();
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") || "50", 10),
    200
  );
  const productById = new Map(store.products.map((p) => [p.id, p]));
  const rows = [...store.activity]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((a) => {
      const p = productById.get(a.product_id);
      return {
        ...a,
        product_name: p?.product,
        barcode: p?.barcode,
      };
    });
  return NextResponse.json({ activity: rows });
}
