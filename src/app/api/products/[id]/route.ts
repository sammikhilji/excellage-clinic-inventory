import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const store = await getStore();
  const product =
    store.products.find((p) => String(p.id) === id || p.barcode === id) ||
    undefined;
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const holdings = store.stock
    .filter((s) => s.product_id === product.id)
    .sort((a, b) => a.location.localeCompare(b.location));
  const activity = store.activity
    .filter((a) => a.product_id === product.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50)
    .map((a) => ({
      ...a,
      product_name: product.product,
      barcode: product.barcode,
    }));

  return NextResponse.json({ ...product, holdings, activity });
}
