import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { resolveBarcode } from "@/lib/barcodes";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const store = await getStore();
  const primary = resolveBarcode(code);
  const product = store.products.find(
    (p) => p.barcode.toUpperCase() === primary
  );
  if (!product) {
    return NextResponse.json(
      { error: "Product not found", code: primary || code },
      { status: 404 }
    );
  }
  const holdings = store.stock
    .filter((s) => s.product_id === product.id)
    .sort((a, b) => a.location.localeCompare(b.location));
  return NextResponse.json({ ...product, holdings });
}
