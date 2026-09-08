import { NextRequest, NextResponse } from "next/server";
import { getStore, persistStore, recalculateTotal } from "@/lib/db";
import type { UserRole } from "@/lib/types";
import {
  codeOwnedByOther,
  normalizeAliasCode,
  parseScanPayload,
} from "@/lib/barcodes";

export const dynamic = "force-dynamic";

const CAN_EDIT: UserRole[] = ["admin", "manager", "head_nurse"];

function findProduct(
  store: Awaited<ReturnType<typeof getStore>>,
  id: string
) {
  return (
    store.products.find((p) => String(p.id) === id || p.barcode === id) ||
    undefined
  );
}

async function requireEditor(req: NextRequest) {
  const usernameCookie = req.cookies.get("clinic_user")?.value?.toLowerCase();
  if (!usernameCookie) return { error: "Not logged in", status: 401 as const };
  const store = await getStore();
  const me = store.users.find((u) => u.username === usernameCookie);
  if (!me) return { error: "Not logged in", status: 401 as const };
  if (!CAN_EDIT.includes(me.role)) {
    return { error: "Only admin, manager, or head nurse can edit products", status: 403 as const };
  }
  return { store, me };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const store = await getStore();
  const product = findProduct(store, id);
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireEditor(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { store } = auth;
    const { id } = await params;
    const product = findProduct(store, id);
    if (!product) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    if (body.product != null || body.name != null) {
      const name = String(body.product ?? body.name ?? "").trim();
      if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }
      product.product = name;
    }
    if (body.category != null || body.heading != null) {
      const category = String(body.category ?? body.heading ?? "").trim();
      product.category = category || "UNCATEGORIZED";
    }
    if (body.expiry !== undefined) {
      const expiryRaw =
        body.expiry === null || body.expiry === ""
          ? null
          : String(body.expiry).trim();
      product.expiry = expiryRaw || null;
    }
    if (body.unit_type != null || body.unit != null) {
      const unit = String(body.unit_type ?? body.unit ?? "").trim();
      if (unit) product.unit_type = unit;
    }
    if (body.price !== undefined) {
      if (body.price === null || body.price === "") {
        product.price = null;
      } else {
        const n = Number(body.price);
        if (Number.isNaN(n) || n < 0) {
          return NextResponse.json(
            { error: "Price must be a number >= 0 or null" },
            { status: 400 }
          );
        }
        product.price = n;
      }
    }
    if (!Array.isArray(product.barcode_aliases)) {
      product.barcode_aliases = [];
    }

    // Link a manufacturer GTIN / unique QR or Data Matrix code
    if (body.link_alias != null || body.add_alias != null) {
      const rawAlias = String(body.link_alias ?? body.add_alias ?? "").trim();
      if (!rawAlias) {
        return NextResponse.json({ error: "Alias code is required" }, { status: 400 });
      }
      const alias = normalizeAliasCode(rawAlias);
      if (/^INV-\d+$/i.test(alias)) {
        return NextResponse.json(
          { error: "Use Link for manufacturer / package codes, not INV codes" },
          { status: 400 }
        );
      }
      if (alias.toUpperCase() === product.barcode.toUpperCase()) {
        return NextResponse.json(
          { error: "That code is already the primary barcode" },
          { status: 400 }
        );
      }
      const owner = codeOwnedByOther(store.products, alias, product.id);
      if (owner) {
        const ownerName =
          "product" in owner && typeof (owner as { product?: string }).product === "string"
            ? (owner as { product: string }).product
            : "another product";
        return NextResponse.json(
          { error: `Code already linked to ${owner.barcode} (${ownerName})` },
          { status: 409 }
        );
      }
      const exists = product.barcode_aliases.some(
        (a) => a.toUpperCase() === alias.toUpperCase() || a.replace(/\D/g, "") === alias.replace(/\D/g, "")
      );
      if (!exists) {
        product.barcode_aliases.push(alias);
      }
      // Optionally adopt expiry from GS1 scan when product has none
      if (body.adopt_scan_expiry && !product.expiry) {
        const parsed = parseScanPayload(rawAlias);
        if (parsed.expiry) product.expiry = parsed.expiry;
      }
    }

    if (body.unlink_alias != null || body.remove_alias != null) {
      const rawAlias = String(body.unlink_alias ?? body.remove_alias ?? "").trim();
      const alias = normalizeAliasCode(rawAlias);
      const ad = alias.replace(/\D/g, "");
      product.barcode_aliases = product.barcode_aliases.filter((a) => {
        const au = a.toUpperCase();
        const aa = a.replace(/\D/g, "");
        return au !== alias.toUpperCase() && !(ad && aa && aa === ad);
      });
    }

    if (Array.isArray(body.barcode_aliases)) {
      product.barcode_aliases = body.barcode_aliases
        .map((a: unknown) => normalizeAliasCode(String(a || "")))
        .filter(Boolean);
    }

    if (body.status != null) {
      const status = String(body.status).trim();
      if (status) product.status = status;
    } else {
      recalculateTotal(store, product.id);
      if (product.total <= 0) product.status = "OUT OF STOCK";
      else if (product.status === "OUT OF STOCK") product.status = "OK";
    }

    await persistStore(store);
    return NextResponse.json({ ok: true, product });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireEditor(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { store } = auth;
    const { id } = await params;
    const product = findProduct(store, id);
    if (!product) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const pid = product.id;
    store.products = store.products.filter((p) => p.id !== pid);
    store.stock = store.stock.filter((s) => s.product_id !== pid);
    store.activity = store.activity.filter((a) => a.product_id !== pid);

    await persistStore(store);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
