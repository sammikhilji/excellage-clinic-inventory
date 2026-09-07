"use client";

import { useEffect, useState } from "react";
import { formatUnitLabel } from "@/lib/types";
import { useParams } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";

type Detail = {
  id: number;
  barcode: string;
  category: string;
  product: string;
  expiry: string | null;
  status: string;
  unit_type: string;
  total: number;
  holdings: { location: string; qty: number }[];
  activity: {
    id: number;
    location: string;
    type: string;
    qty: number;
    note: string | null;
    created_at: string;
  }[];
};

export default function ProductDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [item, setItem] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setItem)
      .catch(() => setErr("Product not found"));
  }, [id]);

  if (err) return <p className="text-rose-600">{err}</p>;
  if (!item) return <p className="text-sm text-slate-500">Loading…</p>;

  const unit = formatUnitLabel(item.unit_type);

  return (
    <div className="space-y-4">
      <Link href="/inventory" className="text-sm text-brand-700 font-semibold">
        ← Back to stock
      </Link>

      <div className="card p-4 space-y-2">
        <p className="font-mono text-xs text-slate-500">{item.barcode}</p>
        <h2 className="text-xl font-bold leading-snug">{item.product}</h2>
        <p className="text-sm text-slate-500">{item.category}</p>
        <div className="flex flex-wrap gap-2 items-center pt-1">
          <StatusBadge status={item.status} />
          {item.expiry && <span className="text-sm text-slate-600">Expiry: {item.expiry}</span>}
        </div>
        <p className="text-2xl font-bold pt-2">
          {item.total} <span className="text-sm font-medium text-slate-500">{unit}</span>
        </p>
      </div>

      <section className="card p-4">
        <h3 className="font-bold mb-3">Per location</h3>
        <div className="space-y-2">
          {item.holdings.map((h) => (
            <div
              key={h.location}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5"
            >
              <span className="text-sm">{h.location}</span>
              <span className="font-bold">{h.qty}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Link href={`/add?barcode=${encodeURIComponent(item.barcode)}`} className="btn-success text-xs">
          Add
        </Link>
        <Link href={`/transfer?barcode=${encodeURIComponent(item.barcode)}`} className="btn-primary text-xs">
          Move
        </Link>
        <Link href={`/consume?barcode=${encodeURIComponent(item.barcode)}`} className="btn-danger text-xs">
          Use
        </Link>
      </div>

      <section className="card p-4">
        <h3 className="font-bold mb-3">Activity history</h3>
        {item.activity.length === 0 ? (
          <p className="text-sm text-slate-500">No movements yet</p>
        ) : (
          <ul className="space-y-2">
            {item.activity.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="capitalize font-medium">{a.type}</span>
                  <span
                    className={
                      a.type === "receive"
                        ? "text-emerald-700"
                        : a.type === "transfer"
                          ? "text-brand-700"
                          : "text-rose-700"
                    }
                  >
                    {a.type === "receive" ? "+" : a.type === "transfer" ? "↔" : "−"}
                    {a.qty}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {a.location} · {a.created_at}
                  {a.note ? ` · ${a.note}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
