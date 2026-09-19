"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthGate";
import type { MonthlyStaffReport } from "@/lib/monthly-staff-report-types";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";
import { formatDateLabel, timeOnly } from "@/lib/activity-display";
import {
  getStockGroup,
  STOCK_GROUP_LABELS,
  type StockGroup,
} from "@/lib/stock-groups";
import StockValueReportSection from "@/components/StockValueReportSection";

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

function lineLoc(r: { to_location?: string; location?: string }) {
  return r.to_location || r.location || "—";
}

function activityType(
  kind: "receive" | "transfer" | "consumption",
  type?: string
) {
  if (kind === "receive") return "Stock added";
  if (kind === "transfer") return "Transfer from Main";
  if (type === "sale") return "Sale";
  if (type === "consumption") return "Use / sale";
  return type || "Use / sale";
}

function dateLine(createdAt: string): string {
  const t = timeOnly(createdAt);
  return t ? `${formatDateLabel(createdAt)} · ${t}` : formatDateLabel(createdAt);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type ReportFormat = "excel" | "pdf";
type ScopeValue = "" | StockGroup;

type GeneratedMeta = {
  from: string;
  to: string;
  scope: ScopeValue;
  category: string;
  includeImports: boolean;
  format: ReportFormat;
};

const SCOPE_OPTIONS: { value: ScopeValue; label: string }[] = [
  { value: "", label: "All" },
  { value: "products", label: "Products only" },
  { value: "consumables", label: "Consumables only" },
  { value: "crash_cart", label: "Crash Cart only" },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const initial = useMemo(() => defaultDateRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [scope, setScope] = useState<ScopeValue>("");
  const [category, setCategory] = useState("");
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryMeta, setCategoryMeta] = useState<
    Record<string, StockGroup>
  >({});
  const [format, setFormat] = useState<ReportFormat>("excel");
  const [includeImports, setIncludeImports] = useState(false);
  const [report, setReport] = useState<MonthlyStaffReport | null>(null);
  const [generated, setGenerated] = useState<GeneratedMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allowed =
    !!user && REPORT_ALLOWED_ROLES.includes(user.role);

  const rangeInvalid = !from || !to || from > to;

  const filteredCategories = useMemo(() => {
    if (!scope) return allCategories;
    return allCategories.filter((c) => categoryMeta[c] === scope);
  }, [allCategories, categoryMeta, scope]);

  // Drop category if it no longer fits the selected scope
  useEffect(() => {
    if (category && !filteredCategories.includes(category)) {
      setCategory("");
    }
  }, [category, filteredCategories]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/products", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const cats: string[] = Array.isArray(data.categories)
          ? data.categories.filter(Boolean)
          : [];
        setAllCategories(cats);
        const meta: Record<string, StockGroup> = {};
        const products = Array.isArray(data.products) ? data.products : [];
        for (const p of products) {
          const cat = String(p.category || "").trim();
          if (!cat || meta[cat]) continue;
          meta[cat] = getStockGroup(p);
        }
        // Fallback: classify by category name alone
        for (const c of cats) {
          if (!meta[c]) meta[c] = getStockGroup({ category: c, product: "" });
        }
        setCategoryMeta(meta);
      } catch {
        /* ignore — category list is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const reportReady =
    !!report &&
    !!generated &&
    generated.from === from &&
    generated.to === to &&
    generated.scope === scope &&
    generated.category === category &&
    generated.includeImports === includeImports &&
    !rangeInvalid;

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams();
    q.set("from", from);
    q.set("to", to);
    if (scope) q.set("group", scope);
    if (category) q.set("category", category);
    if (includeImports) q.set("includeImports", "1");
    return q.toString();
  }, [from, to, scope, category, includeImports]);

  const setThisMonth = () => {
    const r = defaultDateRange();
    setFrom(r.from);
    setTo(r.to);
  };

  const generateReport = async () => {
    if (!allowed) return;
    if (!from || !to) {
      setErr("Select From and To dates");
      setReport(null);
      setGenerated(null);
      return;
    }
    if (from > to) {
      setErr("From must be on or before To");
      setReport(null);
      setGenerated(null);
      return;
    }
    if (format !== "excel" && format !== "pdf") {
      setErr("Select Excel or PDF format");
      return;
    }

    setLoading(true);
    setErr(null);
    const qs = buildQuery();
    const downloadPath =
      format === "excel"
        ? `/api/reports/monthly-staff.xlsx?${qs}`
        : `/api/reports/monthly-staff.pdf?${qs}`;
    const filename =
      format === "excel"
        ? `staff-stock-${from}_to_${to}.xlsx`
        : `staff-stock-${from}_to_${to}.pdf`;

    try {
      const [dlRes, jsonRes] = await Promise.all([
        fetch(downloadPath, { credentials: "include" }),
        fetch(`/api/reports/monthly-staff?${qs}`, { credentials: "include" }),
      ]);

      // Download first so failures are clear
      const ct = dlRes.headers.get("content-type") || "";
      const expectPdf = format === "pdf";
      const expectXlsx = format === "excel";
      const looksOk =
        dlRes.ok &&
        ((expectPdf && ct.includes("application/pdf")) ||
          (expectXlsx &&
            (ct.includes("spreadsheetml") ||
              ct.includes("octet-stream") ||
              ct.includes("application/vnd.openxmlformats"))));

      if (!looksOk) {
        let message = "Download failed";
        try {
          const data = await dlRes.json();
          message = data.error || message;
        } catch {
          message = dlRes.statusText || message;
        }
        setErr(
          `${format === "excel" ? "Excel" : "PDF"} download failed: ${message}`
        );
        setReport(null);
        setGenerated(null);
        return;
      }

      const blob = await dlRes.blob();
      triggerBlobDownload(blob, filename);

      if (jsonRes.ok) {
        try {
          const data = await jsonRes.json();
          setReport(data);
          setGenerated({
            from,
            to,
            scope,
            category,
            includeImports,
            format,
          });
        } catch {
          setReport(null);
          setGenerated({
            from,
            to,
            scope,
            category,
            includeImports,
            format,
          });
        }
      } else {
        // File downloaded; preview optional
        setReport(null);
        setGenerated({
          from,
          to,
          scope,
          category,
          includeImports,
          format,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generate failed";
      setErr(`Generate failed: ${msg}`);
      setReport(null);
      setGenerated(null);
    } finally {
      setLoading(false);
    }
  };

  if (!allowed) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Reports</h2>
        <p className="text-sm text-rose-600">
          Reports are only available to admin, manager, and head nurse.
        </p>
        <Link href="/" className="btn-secondary text-sm">
          ← Back home
        </Link>
      </div>
    );
  }

  const rangeLabel = report?.range_label || report?.month_label || `${from} → ${to}`;
  const scopeLabel =
    SCOPE_OPTIONS.find((o) => o.value === (generated?.scope ?? scope))
      ?.label || "All";

  return (
    <div className="space-y-4 report-page">
      <div className="no-print flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">Reports</h1>
          <p className="text-xs text-slate-500">
            Staff activity and clinic stock value
          </p>
        </div>
        <Link href="/" className="text-xs font-semibold text-brand-700">
          Home
        </Link>
      </div>

      <section className="space-y-4">
      <div className="no-print">
        <h2 className="text-lg font-bold">Staff stock report</h2>
        <p className="text-xs text-slate-500">
          Stock added · transfers from Main Store · use / sale by staff
        </p>
      </div>

      <div className="no-print card p-4 space-y-3">
        {/* 1. Dates */}
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

        {/* 2. Report scope + category */}
        <div>
          <label className="label" htmlFor="report-scope">
            Report scope
          </label>
          <select
            id="report-scope"
            className="input"
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeValue)}
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            Stock type (Products / Consumables / Crash Cart) — not the Category
            dropdown below.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SCOPE_OPTIONS.map((o) => (
              <button
                key={`chip-${o.value || "all"}`}
                type="button"
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                  scope === o.value
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-slate-600 border-slate-200"
                }`}
                onClick={() => setScope(o.value)}
              >
                {o.value === ""
                  ? "All"
                  : STOCK_GROUP_LABELS[o.value as StockGroup]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="report-category">
            Category
          </label>
          <select
            id="report-category"
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {filteredCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={includeImports}
            onChange={(e) => setIncludeImports(e.target.checked)}
          />
          <span>
            <span className="font-medium">Include bulk import adjustments</span>
            <span className="block text-[11px] text-slate-500">
              Off by default hides Crash Cart bulk imports only (user{" "}
              <code className="text-[10px]">import</code>
              ). Product stock-sheet qty/price updates still appear. Always
              included when scope is Crash Cart.
            </span>
          </span>
        </label>

        {/* 3. Format */}
        <div>
          <p className="label mb-1.5">Format</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                format === "excel"
                  ? "border-brand-600 bg-brand-50 text-brand-800"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
              onClick={() => setFormat("excel")}
            >
              Excel
            </button>
            <button
              type="button"
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                format === "pdf"
                  ? "border-brand-600 bg-brand-50 text-brand-800"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
              onClick={() => setFormat("pdf")}
            >
              PDF
            </button>
          </div>
        </div>

        {/* 4. Generate */}
        <button
          type="button"
          className="btn-primary text-sm w-full"
          onClick={() => void generateReport()}
          disabled={loading || rangeInvalid}
        >
          {loading ? "Generating…" : "Generate report"}
        </button>

        <button
          type="button"
          className="btn-secondary text-sm w-full"
          onClick={() => window.print()}
          disabled={!reportReady || !report}
        >
          🖨 Print preview
        </button>

        {!reportReady && !loading && (
          <p className="text-[11px] text-slate-500">
            Choose dates → scope / category → Excel or PDF → Generate report
            (downloads the file and shows a preview).
          </p>
        )}
      </div>

      {loading && <p className="text-sm text-slate-500">Generating…</p>}
      {err && <p className="text-sm text-rose-600">{err}</p>}

      {reportReady && !loading && report && (
        <>
          <div className="print-only mb-4">
            <h1 className="text-xl font-bold">Clinic Inventory</h1>
            <p className="text-sm">
              Staff stock report — {rangeLabel}
            </p>
            <p className="text-xs">
              Scope: {scopeLabel}
              {generated?.category ? ` · Category: ${generated.category}` : ""}
            </p>
          </div>

          <div className="no-print text-xs text-slate-500">
            Preview · {scopeLabel}
            {generated?.category ? ` · ${generated.category}` : ""}
            {generated?.includeImports ? " · incl. bulk imports" : ""}
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
                Stock added
              </p>
              <p className="text-xl font-bold text-emerald-700">
                {fmtQty(report.grand_totals.receive_qty_sum)}
              </p>
              <p className="text-[10px] text-slate-500">
                {report.grand_totals.receive_count} additions
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
            <div className="card p-3 col-span-2">
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
              No stock additions, transfers from Main Store, or use/sale recorded
              for this date range and filters.
            </p>
          ) : (
            <div className="space-y-4">
              {report.staff.map((s) => {
                const rows = [
                  ...s.receives.map((r, i) => ({
                    key: `r-${i}-${r.date}`,
                    date: r.date,
                    product: r.product_name,
                    category: r.category || "—",
                    qty: fmtQty(r.qty),
                    location: lineLoc(r),
                    type: activityType("receive", r.type),
                    note: r.note || "",
                  })),
                  ...s.transfers_from_main.map((t, i) => ({
                    key: `t-${i}-${t.date}`,
                    date: t.date,
                    product: t.product_name,
                    category: t.category || "—",
                    qty: fmtQty(t.qty),
                    location: lineLoc(t),
                    type: activityType("transfer", t.type),
                    note: t.note || "",
                  })),
                  ...s.consumptions.map((c, i) => ({
                    key: `c-${i}-${c.date}`,
                    date: c.date,
                    product: c.product_name,
                    category: c.category || "—",
                    qty: fmtQty(c.qty),
                    location: lineLoc(c),
                    type: activityType("consumption", c.type),
                    note: c.note || "",
                  })),
                ].sort((a, b) => a.date.localeCompare(b.date));

                return (
                  <section
                    key={s.username ?? "__unknown__"}
                    className="card p-4 break-inside-avoid overflow-x-auto"
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
                          + {s.totals.receive_count} · qty{" "}
                          {fmtQty(s.totals.receive_qty_sum)}
                        </div>
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

                    <table className="w-full min-w-[640px] text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#482980] text-white uppercase tracking-wide">
                          <th className="px-2 py-2 font-semibold">Date</th>
                          <th className="px-2 py-2 font-semibold">Product</th>
                          <th className="px-2 py-2 font-semibold">Category</th>
                          <th className="px-2 py-2 font-semibold text-right">Qty</th>
                          <th className="px-2 py-2 font-semibold">Location</th>
                          <th className="px-2 py-2 font-semibold">Type</th>
                          <th className="px-2 py-2 font-semibold">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr
                            key={row.key}
                            className={
                              i % 2 === 1 ? "bg-slate-50" : "bg-white"
                            }
                          >
                            <td className="px-2 py-1.5 whitespace-nowrap border-b border-slate-100">
                              {dateLine(row.date)}
                            </td>
                            <td className="px-2 py-1.5 font-medium border-b border-slate-100">
                              {row.product}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 border-b border-slate-100">
                              {row.category}
                            </td>
                            <td className="px-2 py-1.5 text-right font-semibold border-b border-slate-100">
                              {row.qty}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 border-b border-slate-100">
                              {row.location}
                            </td>
                            <td className="px-2 py-1.5 border-b border-slate-100">
                              {row.type}
                            </td>
                            <td className="px-2 py-1.5 text-slate-500 border-b border-slate-100">
                              {row.note || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
      </section>

      <StockValueReportSection />
    </div>
  );
}
