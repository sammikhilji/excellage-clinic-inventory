"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import type { DashboardData, StockGroupKey, StockGroupSummary } from "@/lib/types";
import { useAuth } from "@/components/AuthGate";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";
import {
  activityTypeLabel,
  formatDateLabel,
  timeOnly,
} from "@/lib/activity-display";
import {
  expiryChipClassCompact,
  formatExpiryChipLabel,
} from "@/lib/expiry-display";

const GROUP_ORDER: StockGroupKey[] = ["products", "consumables", "crash_cart"];

const GROUP_ACCENT: Record<StockGroupKey, string> = {
  products: "border-brand-200 bg-brand-50/40",
  consumables: "border-amber-200 bg-amber-50/50",
  crash_cart: "border-rose-200 bg-rose-50/40",
};

function formatAed(n: number) {
  return Number(n ?? 0).toLocaleString(undefined, {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fallbackGroups(data: DashboardData): Record<StockGroupKey, StockGroupSummary> {
  return {
    products: {
      label: "Products",
      productCount: data.totalProducts,
      totalQty: data.totalQty,
      totalStockValue: data.totalStockValue,
    },
    consumables: {
      label: "Consumables",
      productCount: 0,
      totalQty: 0,
      totalStockValue: 0,
    },
    crash_cart: {
      label: "Crash Cart",
      productCount: 0,
      totalQty: 0,
      totalStockValue: 0,
    },
  };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const canReport = !!user && REPORT_ALLOWED_ROLES.includes(user.role);
  const canEditSettings = !!user && user.role === "admin";
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard")
      .then(async (r) => {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (!json || typeof json.totalProducts !== "number") {
          setErr("Failed to load dashboard");
          return;
        }
        setData(json);
        setErr(null);
      })
      .catch(() => {
        if (!cancelled) setErr("Failed to load dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) return <p className="text-rose-600">{err}</p>;
  if (!data) return <p className="text-slate-500 text-sm">Loading…</p>;

  const groups = data.groups ?? fallbackGroups(data);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{data.totalProducts}</span>{" "}
          products
        </p>
        <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800">
          {formatAed(data.totalStockValue)}
          <span className="ml-1 font-normal text-emerald-700/70">total</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {GROUP_ORDER.map((key) => {
          const g = groups[key];
          return (
            <div
              key={key}
              className={`card border p-4 ${GROUP_ACCENT[key]}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {g.label}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {Number(g.totalQty).toFixed(1)}
              </p>
              <p className="mt-1 inline-flex rounded-lg bg-emerald-50 px-2 py-1.5 text-sm font-semibold text-emerald-800">
                {formatAed(g.totalStockValue)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {g.productCount} product{g.productCount === 1 ? "" : "s"}
              </p>
              {key === "consumables" && (
                <p className="mt-2 text-[10px] leading-tight text-slate-400">
                  Transducers: 1 unit = 2400 lines
                </p>
              )}
            </div>
          );
        })}
      </div>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Stock by location</h2>
        </div>
        <div className="space-y-2">
          {data.stockByLocation.map((s) => {
            const max = Math.max(...data.stockByLocation.map((x) => Number(x.qty)), 1);
            const pct = Math.min(100, (Number(s.qty) / max) * 100);
            return (
              <div key={s.location}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{s.location}</span>
                  <span className="font-semibold">{Number(s.qty).toFixed(1)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-bold">Expiry alerts</h2>
        {data.expiryAlerts.length === 0 ? (
          <p className="text-sm text-slate-500">No expiry alerts</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.expiryAlerts.slice(0, 8).map((p) => (
              <li key={p.id}>
                <Link href={`/inventory/${p.id}`} className="flex items-start justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.product}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className={expiryChipClassCompact(p.status, p.expiry)}>
                        {p.expiry
                          ? formatExpiryChipLabel(p.expiry, { compact: true })
                          : "No expiry"}
                      </span>
                      <span>· qty {p.total}</span>
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-bold">Recent activity</h2>
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet — try Add or Use with the scanner.</p>
        ) : (
          <ul className="space-y-2">
            {data.recentActivity.map((a) => (
              <li key={a.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium truncate">{a.product_name}</span>
                  <span
                    className={
                      a.type === "receive"
                        ? "text-emerald-700 font-semibold"
                        : a.type === "transfer"
                          ? "text-brand-700 font-semibold"
                          : "text-rose-700 font-semibold"
                    }
                  >
                    {a.type === "receive" ? "+" : a.type === "transfer" ? "↔" : "−"}
                    {a.qty}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-700">
                  {activityTypeLabel(a.type)} · {formatDateLabel(a.created_at)}
                  {timeOnly(a.created_at) ? ` · ${timeOnly(a.created_at)}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {a.location}
                  {a.username ? ` · ${a.username}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Link href="/add" className="btn-success text-xs sm:text-sm">
          ➕ Add
        </Link>
        <Link href="/transfer" className="btn-primary text-xs sm:text-sm">
          🔄 Move
        </Link>
        <Link href="/consume" className="btn-danger text-xs sm:text-sm">
          ➖ Use
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Link href="/products/new" className="btn-secondary w-full text-sm">
          🆕 Add new product
        </Link>
        {canEditSettings && (
          <Link href="/settings" className="btn-secondary w-full text-sm">
            ⚙️ Settings
          </Link>
        )}
        {canReport && (
          <Link href="/reports" className="btn-secondary w-full text-sm">
            📊 Monthly staff report
          </Link>
        )}
        <Link href="/inventory" className="btn-secondary w-full text-sm">
          📦 Browse all stock
        </Link>
      </div>
    </div>
  );
}
