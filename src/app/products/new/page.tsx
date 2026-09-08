"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthGate";
import { LOCATIONS, UNIT_OPTIONS, UNIT_LABELS } from "@/lib/types";

export default function NewProductPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([...LOCATIONS]);
  const [product, setProduct] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unitType, setUnitType] = useState<string>("units");
  const [customUnit, setCustomUnit] = useState("");
  const [expiry, setExpiry] = useState("");
  const [location, setLocation] = useState<string>("Main Store");
  const [initialQty, setInitialQty] = useState("0");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.locations) && d.locations.length) {
          setLocations(d.locations);
          if (!d.locations.includes(location)) setLocation(d.locations[0]);
        }
        if (Array.isArray(d.categories) && d.categories.length && !categories.length) {
          setCategories(d.categories);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);
    const name = product.trim();
    if (!name) {
      setErr("Product name is required");
      return;
    }
    const cat =
      category === "__custom__"
        ? customCategory.trim()
        : category.trim() || customCategory.trim();
    if (!cat) {
      setErr("Category is required");
      return;
    }
    if (unitType === "__custom__" && !customUnit.trim()) {
      setErr("Enter a custom unit label");
      return;
    }
    const qty = parseFloat(initialQty);
    if (Number.isNaN(qty) || qty < 0) {
      setErr("Initial quantity must be 0 or more");
      return;
    }
    let priceVal: number | null = null;
    if (price.trim() !== "") {
      priceVal = Number(price);
      if (Number.isNaN(priceVal) || priceVal < 0) {
        setErr("Price must be 0 or more, or leave blank");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: name,
          category: cat,
          barcode: barcode.trim() || undefined,
          unit_type:
            unitType === "__custom__"
              ? customUnit.trim() || "units"
              : unitType,
          expiry: expiry.trim() || null,
          price: priceVal,
          location,
          initial_qty: qty,
          note: note.trim() || undefined,
          username: user?.username,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Failed to create product");
        return;
      }
      setOkMsg(
        `Created ${data.product.product} (${data.product.barcode})`
      );
      setTimeout(() => {
        router.push(`/inventory/${data.product.id}`);
      }, 600);
    } catch {
      setErr("Failed to create product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Add new product</h2>
        <p className="text-sm text-slate-500">
          Create a brand-new consumable / SKU. To only increase stock on an
          existing item, use{" "}
          <Link href="/add" className="font-semibold text-brand-700">
            Add stock
          </Link>
          .
        </p>
      </div>

      <form onSubmit={onSubmit} className="card p-4 space-y-3">
        <div>
          <label className="label" htmlFor="np-name">
            Product name *
          </label>
          <input
            id="np-name"
            className="input"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="e.g. Restylane Lyft 1 mL"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="np-cat">
            Category *
          </label>
          <select
            id="np-cat"
            className="input py-2.5 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.length > 50 ? c.slice(0, 50) + "…" : c}
              </option>
            ))}
            <option value="__custom__">Other (type below)…</option>
          </select>
          {(category === "__custom__" || !category) && (
            <input
              className="input mt-2"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder={
                category === "__custom__"
                  ? "New category name"
                  : "Or type a new category"
              }
            />
          )}
        </div>

        <div>
          <label className="label" htmlFor="np-barcode">
            Barcode / GTIN (optional)
          </label>
          <input
            id="np-barcode"
            className="input font-mono text-sm"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Leave blank → auto INV-####"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Empty barcode auto-assigns the next INV-#### code.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="np-unit">
              Unit (stock count)
            </label>
            <select
              id="np-unit"
              className="input py-2.5 text-sm"
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u] || u}
                </option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>
            {unitType === "__custom__" && (
              <input
                className="input mt-2"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="e.g. ampule, kit, cartridge"
              />
            )}
          </div>
          <div>
            <label className="label" htmlFor="np-expiry">
              Expiry (optional)
            </label>
            <input
              id="np-expiry"
              type="date"
              className="input py-2.5 text-sm"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="np-price">
            Price (optional)
          </label>
          <input
            id="np-price"
            type="number"
            min={0}
            step="any"
            className="input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 450 — money amount, not units"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Separate from unit type above. Leave blank if no price.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="np-loc">
              Initial location
            </label>
            <select
              id="np-loc"
              className="input py-2.5 text-sm"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="np-qty">
              Initial qty
            </label>
            <input
              id="np-qty"
              type="number"
              min={0}
              step="any"
              className="input"
              value={initialQty}
              onChange={(e) => setInitialQty(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="np-note">
            Note (optional)
          </label>
          <input
            id="np-note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Opening stock / supplier…"
          />
        </div>

        {err && (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
            {err}
          </p>
        )}
        {okMsg && (
          <p className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
            {okMsg}
          </p>
        )}

        <button type="submit" className="btn-success w-full" disabled={saving}>
          {saving ? "Saving…" : "Create product"}
        </button>
        <Link href="/inventory" className="btn-secondary w-full text-sm">
          Cancel
        </Link>
      </form>
    </div>
  );
}
