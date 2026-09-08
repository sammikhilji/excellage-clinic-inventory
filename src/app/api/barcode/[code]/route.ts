import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import {
  findProductByScan,
  normalizeAliasCode,
  parseScanPayload,
  resolveBarcodeWithStore,
} from "@/lib/barcodes";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const store = await getStore();
  const parsed = parseScanPayload(code);
  const primary = resolveBarcodeWithStore(code, store.products);
  const product = findProductByScan(store.products, code);

  if (!product) {
    const extracted = parsed.gtin || normalizeAliasCode(code) || primary || code;
    return NextResponse.json(
      {
        error: "Product not found",
        code: primary || code,
        extracted_gtin: parsed.gtin,
        extracted_code: extracted,
        expiry_from_scan: parsed.expiry,
        lot_from_scan: parsed.lot,
        hint: "Create a new product or link this unique code on an existing product detail page.",
      },
      { status: 404 }
    );
  }

  const holdings = store.stock
    .filter((s) => s.product_id === product.id)
    .sort((a, b) => a.location.localeCompare(b.location));

  return NextResponse.json({
    ...product,
    holdings,
    scan: {
      matched_via: primary,
      gtin: parsed.gtin,
      expiry_from_scan: parsed.expiry,
      lot_from_scan: parsed.lot,
    },
  });
}
