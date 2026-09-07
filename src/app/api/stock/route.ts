import { NextRequest, NextResponse } from "next/server";
import { getStore, persistStore, recalculateTotal, nowIso } from "@/lib/db";
import { LOCATIONS, type Activity, type StockHolding } from "@/lib/types";
import { resolveBarcode } from "@/lib/barcodes";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      barcode,
      productId,
      location,
      qty,
      type,
      note,
      username,
    }: {
      barcode?: string;
      productId?: number;
      location: string;
      qty: number;
      type: "receive" | "consumption" | "sale" | "adjust";
      note?: string;
      username?: string;
    } = body;

    if (!location || !LOCATIONS.includes(location as (typeof LOCATIONS)[number])) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }
    if (typeof qty !== "number" || Number.isNaN(qty) || qty === 0) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
    }
    if (!["receive", "consumption", "sale", "adjust"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const store = await getStore();
    let product = productId
      ? store.products.find((p) => p.id === productId)
      : undefined;
    if (!product && barcode) {
      const bc = resolveBarcode(barcode);
      product = store.products.find((p) => p.barcode.toUpperCase() === bc);
    }

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const absQty = Math.abs(qty);
    let delta = absQty;
    if (type === "consumption" || type === "sale") {
      delta = -absQty;
    } else if (type === "adjust") {
      delta = qty;
    }

    let holding = store.stock.find(
      (s) => s.product_id === product!.id && s.location === location
    );
    const currentQty = holding?.qty ?? 0;
    const newQty = currentQty + delta;

    if (newQty < -0.0001) {
      return NextResponse.json(
        { error: `Insufficient stock at ${location}. Available: ${currentQty}` },
        { status: 400 }
      );
    }

    if (holding) {
      holding.qty = Math.max(0, newQty);
    } else {
      holding = {
        id: store.nextIds.stock++,
        product_id: product.id,
        location: location as StockHolding["location"],
        qty: Math.max(0, newQty),
      };
      store.stock.push(holding);
    }

    const actor =
      (typeof username === "string" && username.trim()) ||
      req.cookies.get("clinic_user")?.value ||
      null;

    const activity: Activity = {
      id: store.nextIds.activity++,
      product_id: product.id,
      location,
      type,
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
