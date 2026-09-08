"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthGate";
import type { MonthlyStaffReport } from "@/lib/monthly-staff-report-types";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";

/** YYYY-MM-DD in Asia/Dubai (falls back to local if Intl fails). */
function ymdInDubai(d = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

function defaultDateRange() {
  const to = ymdInDubai();
  const from = `${to.slice(0, 7)}-01`;
  return { from, to };
}

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function ReportsPage() {
  const { user } = useAuth();
  const initial = useMemo(() => defaultDateRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<MonthlyStaffReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allowed =
    !!user && REPORT_ALLOWED_ROLES.includes(user.role);

  const rangeInvalid = !from || !to || from > to;

  const load = useCallback(async () => {
    if (!allowed) return;
    if (!from || !to) {
      setErr("Select From and To dates");
      setReport(null);
      return;
    }
    if (from > to) {
      setErr("From must be on or before To");
      setReport(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/reports/monthly-staff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Failed to load report");
        setReport(null);
        return;
      }
      setReport(data);
    } catch {
      setErr("Failed to load report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [allowed, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const setThisMonth = () => {
    const r = defaultDateRange();
    setFrom(r.from);
    setTo(r.to);
  };

  if (!allowed) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Staff stock report</h2>
        <p className="text-sm text-rose-600">
          This report is only available to admin, manager, and head nurse.
        </p>
        <Link href="/" className="btn-secondary text-sm">
          ← Back home
        </Link>
      </div>
    );
  }

  const rangeLabel = report?.range_label || report?.month_label || `${from} → ${to}`;

  return (
    <div className="space-y-4 report-page">
      <div className="no-print flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Staff stock report</h2>
          <p className="text-xs text-slate-500">
            Stock taken from Main Store · consumption / sale by staff
          </p>
        </div>
        <Link href="/" className="text-xs font-semibold text-brand-700">
          Home
        </Link>
      </div>

      <div className="no-print card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="report-from">
              From
            </label>
            <input
              id="report-from"
              type="date"
              className="input"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="report-to">
              To
            </label>
            <input
              id="report-to"
              type="date"
              className="input"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary text-xs w-full"
          onClick={setThisMonth}
        >
          This month (1st → today)
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-sm flex-1"
            onClick={() => window.print()}
            disabled={!report || rangeInvalid}
          >
            🖨 Print
          </button>
          <a
            className={`btn-primary text-sm flex-1 text-center ${!report || rangeInvalid ? "pointer-events-none opacity-50" : ""}`}
            href={`/api/reports/monthly-staff.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
            download
          >
            ⬇ CSV (Excel)
          </a>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {err && <p className="text-sm text-rose-600">{err}</p>}

      {report && !loading && (
        <>
          <div className="print-only mb-4">
            <h1 className="text-xl font-bold">Clinic Inventory</h1>
            <p className="text-sm">
              Staff stock report — {rangeLabel}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">
                Staff with activity
              </p>
              <p className="text-xl font-bold">
                {report.grand_totals.staff_count}
              </p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">
                Date range
              </p>
              <p className="text-sm font-bold leading-tight pt-1">
                {rangeLabel}
              </p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">
                From Main Store
              </p>
              <p className="text-xl font-bold text-brand-700">
                {fmtQty(report.grand_totals.transfer_qty_sum)}
              </p>
              <p className="text-[10px] text-slate-500">
                {report.grand_totals.transfer_count} transfers
              </p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">
                Use / sale
              </p>
              <p className="text-xl font-bold text-rose-700">
                {fmtQty(report.grand_totals.consumption_qty_sum)}
              </p>
              <p className="text-[10px] text-slate-500">
                {report.grand_totals.consumption_count} records
              </p>
            </div>
          </div>

          {report.staff.length === 0 ? (
            <p className="text-sm text-slate-500 card p-4">
              No transfers from Main Store or consumption/sale recorded for this
              date range.
            </p>
          ) : (
            <div className="space-y-4">
              {report.staff.map((s) => (
                <section
                  key={s.username ?? "__unknown__"}
                  className="card p-4 break-inside-avoid"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-base">{s.display_name}</h3>
                      {s.username ? (
                        <p className="text-xs text-slate-500">@{s.username}</p>
                      ) : (
                        <p className="text-xs text-amber-700">
                          Older rows without login username
                        </p>
                      )}
                    </div>
                    <div className="text-right text-[10px] text-slate-500 leading-tight">
                      <div>
                        ↔ {s.totals.transfer_count} · qty{" "}
                        {fmtQty(s.totals.transfer_qty_sum)}
                      </div>
                      <div>
                        − {s.totals.consumption_count} · qty{" "}
                        {fmtQty(s.totals.consumption_qty_sum)}
                      </div>
                    </div>
                  </div>

                  {s.transfers_from_main.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1.5">
                        Took from Main Store
                      </h4>
                      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
                        {s.transfers_from_main.map((t, i) => (
                          <li
                            key={`t-${i}-${t.date}`}
                            className="bg-slate-50 px-3 py-2 text-sm"
                          >
                            <div className="flex justify-between gap-2">
                              <span className="font-medium truncate">
                                {t.product_name}
                              </span>
                              <span className="font-semibold text-brand-700 shrink-0">
                                {fmtQty(t.qty)}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {t.date.slice(0, 10)} · → {t.to_location}
                              {t.barcode ? ` · ${t.barcode}` : ""}
                              {t.note ? ` · ${t.note}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {s.consumptions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-700 mb-1.5">
                        Use / sale
                      </h4>
                      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
                        {s.consumptions.map((c, i) => (
                          <li
                            key={`c-${i}-${c.date}`}
                            className="bg-slate-50 px-3 py-2 text-sm"
                          >
                            <div className="flex justify-between gap-2">
                              <span className="font-medium truncate">
                                {c.product_name}
                              </span>
                              <span className="font-semibold text-rose-700 shrink-0">
                                {fmtQty(c.qty)}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {c.date.slice(0, 10)} · {c.type} · {c.location}
                              {c.barcode ? ` · ${c.barcode}` : ""}
                              {c.note ? ` · ${c.note}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
