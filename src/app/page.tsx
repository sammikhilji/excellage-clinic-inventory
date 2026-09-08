"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import type { DashboardData } from "@/lib/types";
import { useAuth } from "@/components/AuthGate";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";
import {
  activityTypeLabel,
  formatDateLabel,
  timeOnly,
} from "@/lib/activity-display";

export default function DashboardPage() {
  const { user } = useAuth();
  const canReport = !!user && REPORT_ALLOWED_ROLES.includes(user.role);
  const canEditSettings =
    !!user && ["admin", "manager", "head_nurse"].includes(user.role);
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs text-slate-500">Products</p>
          <p className="text-2xl font-bold">{data.totalProducts}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total qty</p>
          <p className="text-2xl font-bold">{Number(data.totalQty).toFixed(1)}</p>
        </div>
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
                    <p className="text-xs text-slate-500">
                      {p.expiry || "—"} · qty {p.total}
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
