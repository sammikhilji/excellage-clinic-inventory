"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { LOCATIONS, formatUnitLabel } from "@/lib/types";

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

  const countLabel = useMemo(() => `${products.length} items`, [products]);

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

      <p className="text-xs text-slate-500">{loading ? "Loading…" : countLabel}</p>

      <ul className="space-y-2">
        {products.map((p) => (
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
                <StatusBadge status={p.status} />
                {p.expiry && <span className="text-[10px] text-slate-500">Exp {p.expiry}</span>}
                {p.price != null && (
                  <span className="text-[10px] font-medium text-slate-600">
                    {p.price.toLocaleString(undefined, {
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
