import { NextRequest, NextResponse } from "next/server";
import { ensureLocations, getStore, persistStore, recalculateTotal, nowIso } from "@/lib/db";
import { type Activity, type StockHolding } from "@/lib/types";
import { findProductByScan } from "@/lib/barcodes";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      barcode,
      productId,
      fromLocation,
      toLocation,
      qty,
      note,
      username,
    }: {
      barcode?: string;
      productId?: number;
      fromLocation: string;
      toLocation: string;
      qty: number;
      note?: string;
      username?: string;
    } = body;

    if (fromLocation === toLocation) {
      return NextResponse.json(
        { error: "FROM and TO must be different" },
        { status: 400 }
      );
    }
    if (typeof qty !== "number" || Number.isNaN(qty) || qty <= 0) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
    }

    const store = await getStore();
    ensureLocations(store);
    if (
      !fromLocation ||
      !toLocation ||
      !store.locations.includes(fromLocation) ||
      !store.locations.includes(toLocation)
    ) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }
    let product = productId
      ? store.products.find((p) => p.id === productId)
      : undefined;
    if (!product && barcode) {
      product = findProductByScan(store.products, barcode);
    }
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const absQty = Math.abs(qty);
    let fromHolding = store.stock.find(
      (s) => s.product_id === product!.id && s.location === fromLocation
    );
    const fromQty = fromHolding?.qty ?? 0;
    if (fromQty + 0.0001 < absQty) {
      return NextResponse.json(
        {
          error: `Insufficient stock at ${fromLocation}. Available: ${fromQty}`,
        },
        { status: 400 }
      );
    }

    if (fromHolding) {
      fromHolding.qty = Math.max(0, fromQty - absQty);
    } else {
      fromHolding = {
        id: store.nextIds.stock++,
        product_id: product.id,
        location: fromLocation,
        qty: 0,
      };
      store.stock.push(fromHolding);
    }

    let toHolding = store.stock.find(
      (s) => s.product_id === product!.id && s.location === toLocation
    );
    if (toHolding) {
      toHolding.qty = (toHolding.qty ?? 0) + absQty;
    } else {
      toHolding = {
        id: store.nextIds.stock++,
        product_id: product.id,
        location: toLocation,
        qty: absQty,
      };
      store.stock.push(toHolding);
    }

    const actor =
      (typeof username === "string" && username.trim()) ||
      req.cookies.get("clinic_user")?.value ||
      null;

    const activity: Activity = {
      id: store.nextIds.activity++,
      product_id: product.id,
      location: `${fromLocation} → ${toLocation}`,
      type: "transfer",
      qty: absQty,
      note: note || null,
      created_at: nowIso(),
      username: actor ? String(actor).trim().toLowerCase() : null,
    };
    store.activity.push(activity);

    recalculateTotal(store, product.id);
    await persistStore(store);

    const updated = store.products.find((p) => p.id === product!.id);
    const holdings = store.stock
      .filter((s) => s.product_id === product!.id)
      .sort((a, b) => a.location.localeCompare(b.location));

    return NextResponse.json({ ok: true, product: { ...updated, holdings } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
