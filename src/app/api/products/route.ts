import { NextRequest, NextResponse } from "next/server";
import { ensureLocations, getStore, persistStore, recalculateTotal, nowIso } from "@/lib/db";
import {
  type Activity,
  type Product,
  type StockHolding,
  type UnitType,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const store = await getStore();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().toLowerCase() || "";
  const category = sp.get("category") || "";
  const location = sp.get("location") || "";
  const status = sp.get("status") || "";

  let products = store.products.slice();

  if (q) {
    products = products.filter(
      (p) =>
        p.product.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }
  if (category) {
    products = products.filter((p) => p.category === category);
  }
  if (status) {
    products = products.filter((p) => p.status === status);
  }
  if (location) {
    const withStock = new Set(
      store.stock
        .filter((s) => s.location === location && s.qty > 0)
        .map((s) => s.product_id)
    );
    products = products.filter((p) => withStock.has(p.id));
  }

  products.sort((a, b) => {
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    return a.product.localeCompare(b.product);
  });

  const result = products.map((p) => ({
    ...p,
    holdings: store.stock.filter((s) => s.product_id === p.id),
  }));

  const categories = [...new Set(store.products.map((p) => p.category))].sort();
  const statuses = [...new Set(store.products.map((p) => p.status))].sort();

  return NextResponse.json({ products: result, categories, statuses });
}

function nextInvBarcode(store: Awaited<ReturnType<typeof getStore>>): string {
  let maxN = 0;
  for (const p of store.products) {
    const m = /^INV-(\d+)$/i.exec(p.barcode || "");
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  // also consider numeric product ids as a floor
  for (const p of store.products) {
    maxN = Math.max(maxN, p.id);
  }
  return `INV-${String(maxN + 1).padStart(4, "0")}`;
}

/** Create a brand-new product (+ optional opening stock / receive activity). */
export async function POST(req: NextRequest) {
  try {
    const usernameCookie = req.cookies.get("clinic_user")?.value?.toLowerCase();
    if (!usernameCookie) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const store = await getStore();
    const me = store.users.find((u) => u.username === usernameCookie);
    if (!me) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const body = await req.json();
    const productName = String(body.product || body.name || "").trim();
    const category = String(body.category || "").trim() || "UNCATEGORIZED";
    let barcode = String(body.barcode || "").trim().toUpperCase();
    const rawUnit = String(body.unit_type || body.unit || "units").trim();
    const unit_type: UnitType = rawUnit || "units";
    const expiryRaw = body.expiry != null ? String(body.expiry).trim() : "";
    const expiry = expiryRaw || null;
    const location = String(body.location || "Main Store").trim();
    const initialQty =
      body.initial_qty != null
        ? Number(body.initial_qty)
        : body.qty != null
          ? Number(body.qty)
          : 0;
    const note =
      body.note != null && String(body.note).trim()
        ? String(body.note).trim()
        : "New product opening stock";
    const actor =
      (typeof body.username === "string" && body.username.trim()) ||
      usernameCookie;

    if (!productName) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 }
      );
    }
    ensureLocations(store);
    if (!store.locations.includes(location)) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }
    if (
      initialQty != null &&
      (Number.isNaN(initialQty) || initialQty < 0)
    ) {
      return NextResponse.json(
        { error: "Invalid initial quantity" },
        { status: 400 }
      );
    }

    if (!barcode) {
      barcode = nextInvBarcode(store);
    }

    const dup = store.products.find(
      (p) => p.barcode.toUpperCase() === barcode
    );
    if (dup) {
      return NextResponse.json(
        { error: `Barcode ${barcode} already exists` },
        { status: 409 }
      );
    }

    const createdAt = nowIso();
    const productId = store.nextIds.products++;
    const product: Product = {
      id: productId,
      barcode,
      category,
      product: productName,
      expiry,
      status: "OK",
      unit_type,
      total: 0,
      created_at: createdAt,
    };
    store.products.push(product);

    const qty = initialQty || 0;
    if (qty > 0) {
      const holding: StockHolding = {
        id: store.nextIds.stock++,
        product_id: productId,
        location,
        qty,
      };
      store.stock.push(holding);

      const activity: Activity = {
        id: store.nextIds.activity++,
        product_id: productId,
        location,
        type: "receive",
        qty,
        note,
        created_at: createdAt,
        username: actor ? String(actor).trim().toLowerCase() : null,
      };
      store.activity.push(activity);
    }

    recalculateTotal(store, productId);
    await persistStore(store);

    const updated = store.products.find((p) => p.id === productId);
    const holdings = store.stock
      .filter((s) => s.product_id === productId)
      .sort((a, b) => a.location.localeCompare(b.location));

    return NextResponse.json(
      { ok: true, product: { ...updated, holdings } },
      { status: 201 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
