"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { LOCATIONS, formatUnitLabel } from "@/lib/types";
import {
  displayProductStatus,
  expiryChipClassCompact,
  expiryStatusRank,
  formatExpiryChipLabel,
  parseExpiryTimestamp,
} from "@/lib/expiry-display";
import { getStockGroup, type StockGroup } from "@/lib/stock-groups";
import { stockValue } from "@/lib/stock-metrics";

type SortMode = "default" | "near_expiry" | "high_value" | "low_value";

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "near_expiry", label: "Near expiry first" },
  { id: "high_value", label: "High value first" },
  { id: "low_value", label: "Low value first" },
];

type Product = {
  id: number;
  barcode: string;
  barcode_aliases?: string[];
  category: string;
  product: string;
  expiry: string | null;
  status: string;
  unit_type: string;
  price: number | null;
  total: number;
  holdings: { location: string; qty: number }[];
};

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([...LOCATIONS]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const [stockGroup, setStockGroup] = useState<StockGroup | "">("");
  const [sort, setSort] = useState<SortMode>("default");
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.locations) && d.locations.length) {
          setLocations(d.locations);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (location) params.set("location", location);
    if (status) params.set("status", status);
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/products?${params}`)
        .then((r) => r.json())
        .then((d) => {
          setProducts(d.products || []);
          setCategories(d.categories || []);
          setStatuses(d.statuses || []);
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, category, location, status]);

  const filtered = useMemo(() => {
    if (!stockGroup) return products;
    return products.filter((p) => getStockGroup(p) === stockGroup);
  }, [products, stockGroup]);

  const sorted = useMemo(() => {
    if (sort === "default") return filtered;

    const list = [...filtered];
    if (sort === "near_expiry") {
      list.sort((a, b) => {
        const da = parseExpiryTimestamp(a.expiry);
        const db = parseExpiryTimestamp(b.expiry);
        if (da != null && db != null) {
          if (da !== db) return da - db;
          return a.product.localeCompare(b.product);
        }
        if (da != null) return -1;
        if (db != null) return 1;
        const ra = expiryStatusRank(a.status);
        const rb = expiryStatusRank(b.status);
        if (ra !== rb) return ra - rb;
        return a.product.localeCompare(b.product);
      });
      return list;
    }

    if (sort === "high_value") {
      list.sort((a, b) => {
        const va = stockValue(a.price, a.total);
        const vb = stockValue(b.price, b.total);
        if (vb !== va) return vb - va;
        return a.product.localeCompare(b.product);
      });
      return list;
    }

    // low_value: ascending value; null price last so real lows show first
    list.sort((a, b) => {
      const aNull = a.price == null;
      const bNull = b.price == null;
      if (aNull !== bNull) return aNull ? 1 : -1;
      const va = stockValue(a.price, a.total);
      const vb = stockValue(b.price, b.total);
      if (va !== vb) return va - vb;
      return a.product.localeCompare(b.product);
    });
    return list;
  }, [filtered, sort]);

  const countLabel = useMemo(() => `${sorted.length} items`, [sorted]);

  const GROUP_CHIPS: { id: StockGroup | ""; label: string }[] = [
    { id: "", label: "All" },
    { id: "products", label: "Products" },
    { id: "consumables", label: "Consumables" },
    { id: "crash_cart", label: "Crash Cart" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Stock list</h2>
        <Link
          href="/products/new"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"
        >
          🆕 New product
        </Link>
      </div>
      <input
        className="input"
        placeholder="Search product, barcode, category…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {GROUP_CHIPS.map((chip) => {
          const active = stockGroup === chip.id;
          return (
            <button
              key={chip.id || "all"}
              type="button"
              onClick={() => setStockGroup(chip.id)}
              className={
                active
                  ? "rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
              }
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select className="input py-2.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.length > 40 ? c.slice(0, 40) + "…" : c}
            </option>
          ))}
        </select>
        <select className="input py-2.5 text-sm" value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select className="input py-2.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Sort</span>
        <select
          className="input py-2.5 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-slate-500">{loading ? "Loading…" : countLabel}</p>

      <ul className="space-y-2">
        {sorted.map((p) => (
          <li key={p.id}>
            <Link href={`/inventory/${p.id}`} className="card block p-3 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-sm">{p.product}</p>
                  <p className="truncate text-xs text-slate-500">{p.category}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">{p.barcode}</p>
                  {(p.barcode_aliases || []).length > 0 && (
                    <p className="font-mono text-[9px] text-slate-400 truncate">
                      Unique: {(p.barcode_aliases || []).join(", ")}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold leading-none">{p.total}</p>
                  <p className="text-[10px] text-slate-400">
                    {formatUnitLabel(p.unit_type)}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={displayProductStatus(p)} />
                {p.expiry && (
                  <span
                    className={expiryChipClassCompact(
                      displayProductStatus(p),
                      p.expiry
                    )}
                  >
                    {formatExpiryChipLabel(p.expiry, { compact: true })}
                  </span>
                )}
                {p.price != null && (
                  <span className="rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-800">
                    {p.price.toLocaleString(undefined, {
                      style: "currency",
                      currency: "AED",
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )}
                {p.price != null && (
                  <span className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] font-semibold text-emerald-800">
                    Value:{" "}
                    {stockValue(p.price, p.total).toLocaleString(undefined, {
                      style: "currency",
                      currency: "AED",
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
