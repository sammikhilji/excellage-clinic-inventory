"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LOCATIONS } from "@/lib/types";
import {
  getStockGroup,
  STOCK_GROUP_LABELS,
  type StockGroup,
} from "@/lib/stock-groups";
import type { StockValueReport } from "@/lib/stock-value-report";

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

function formatAed(n: number) {
  return Number(n ?? 0).toLocaleString(undefined, {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "") || "0";
}

type ReportFormat = "pdf" | "csv";
type ScopeValue = "" | StockGroup;

type GeneratedMeta = {
  date: string;
  location: string;
  category: string;
  scope: ScopeValue;
  format: ReportFormat;
};

const SCOPE_OPTIONS: { value: ScopeValue; label: string }[] = [
  { value: "", label: "All" },
  { value: "products", label: "Products" },
  { value: "consumables", label: "Consumables" },
  { value: "crash_cart", label: "Crash Cart" },
];

export default function StockValueReportSection() {
  const [date, setDate] = useState(() => ymdInDubai());
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<ScopeValue>("");
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [locations, setLocations] = useState<string[]>([...LOCATIONS]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryMeta, setCategoryMeta] = useState<Record<string, StockGroup>>(
    {}
  );
  const [report, setReport] = useState<StockValueReport | null>(null);
  const [generated, setGenerated] = useState<GeneratedMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    if (!scope) return allCategories;
    return allCategories.filter((c) => categoryMeta[c] === scope);
  }, [allCategories, categoryMeta, scope]);

  useEffect(() => {
    if (category && !filteredCategories.includes(category)) {
      setCategory("");
    }
  }, [category, filteredCategories]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prodRes, settingsRes] = await Promise.all([
          fetch("/api/products", { credentials: "include" }),
          fetch("/api/settings", { credentials: "include" }),
        ]);
        if (prodRes.ok) {
          const data = await prodRes.json();
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
          for (const c of cats) {
            if (!meta[c]) meta[c] = getStockGroup({ category: c, product: "" });
          }
          setCategoryMeta(meta);
        }
        if (settingsRes.ok) {
          const d = await settingsRes.json();
          if (
            !cancelled &&
            Array.isArray(d.locations) &&
            d.locations.length
          ) {
            setLocations(d.locations);
          }
        }
      } catch {
        /* optional filter lists */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reportReady =
    !!report &&
    !!generated &&
    generated.date === date &&
    generated.location === location &&
    generated.category === category &&
    generated.scope === scope;

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams();
    if (date) q.set("date", date);
    if (location) q.set("location", location);
    if (category) q.set("category", category);
    if (scope) q.set("group", scope);
    return q.toString();
  }, [date, location, category, scope]);

  const generateReport = async () => {
    if (!date) {
      setErr("Select a date");
      setReport(null);
      setGenerated(null);
      return;
    }
    if (format !== "pdf" && format !== "csv") {
      setErr("Select PDF or CSV format");
      return;
    }

    setLoading(true);
    setErr(null);
    const qs = buildQuery();
    const downloadPath =
      format === "pdf"
        ? `/api/reports/stock-value.pdf?${qs}`
        : `/api/reports/stock-value.csv?${qs}`;
    const filename =
      format === "pdf"
        ? `stock-value-${date}.pdf`
        : `stock-value-${date}.csv`;

    try {
      const [dlRes, jsonRes] = await Promise.all([
        fetch(downloadPath, { credentials: "include" }),
        fetch(`/api/reports/stock-value?${qs}`, { credentials: "include" }),
      ]);

      const ct = dlRes.headers.get("content-type") || "";
      const looksOk =
        dlRes.ok &&
        ((format === "pdf" && ct.includes("application/pdf")) ||
          (format === "csv" &&
            (ct.includes("text/csv") || ct.includes("text/plain"))));

      if (!looksOk) {
        let message = "Download failed";
        try {
          const data = await dlRes.json();
          message = data.error || message;
        } catch {
          message = dlRes.statusText || message;
        }
        setErr(
          `${format === "pdf" ? "PDF" : "CSV"} download failed: ${message}`
        );
        setReport(null);
        setGenerated(null);
        return;
      }

      const blob = await dlRes.blob();
      triggerBlobDownload(blob, filename);

      if (jsonRes.ok) {
        try {
          const data = (await jsonRes.json()) as StockValueReport;
          setReport(data);
          if (Array.isArray(data.locations) && data.locations.length) {
            setLocations(data.locations);
          }
          if (Array.isArray(data.categories) && data.categories.length) {
            setAllCategories(data.categories);
          }
          setGenerated({ date, location, category, scope, format });
        } catch {
          setReport(null);
          setGenerated({ date, location, category, scope, format });
        }
      } else {
        setReport(null);
        setGenerated({ date, location, category, scope, format });
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

  const scopeLabel =
    SCOPE_OPTIONS.find((o) => o.value === (generated?.scope ?? scope))
      ?.label || "All";

  return (
    <section
      id="stock-value-report"
      className="space-y-4 report-page border-t-2 border-slate-300 pt-6 mt-6"
    >
      <div className="no-print">
        <h2 className="text-lg font-bold">Stock value report</h2>
        <p className="text-xs text-slate-500">
          Clinic stock value by department — scroll below Staff stock report.
          Live current stock (as-of date is a label only).
        </p>
      </div>

      <div className="no-print card p-4 space-y-3">
        {/* 1. Date */}
        <div>
          <label className="label" htmlFor="sv-date">
            Date (as of)
          </label>
          <input
            id="sv-date"
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Defaults to today (Asia/Dubai). Report always uses live current
            stock — not a historical snapshot.
          </p>
        </div>

        {/* 2. Department */}
        <div>
          <label className="label" htmlFor="sv-department">
            Department
          </label>
          <select
            id="sv-department"
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">All</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Category */}
        <div>
          <label className="label" htmlFor="sv-category">
            Category
          </label>
          <select
            id="sv-category"
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All</option>
            {filteredCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Optional scope */}
        <div>
          <label className="label" htmlFor="sv-scope">
            Report scope (optional)
          </label>
          <select
            id="sv-scope"
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
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SCOPE_OPTIONS.map((o) => (
              <button
                key={`sv-chip-${o.value || "all"}`}
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

        {/* 5. Format */}
        <div>
          <p className="label mb-1.5">Format</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                format === "csv"
                  ? "border-brand-600 bg-brand-50 text-brand-800"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
              onClick={() => setFormat("csv")}
            >
              CSV
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

        {/* 6. Generate */}
        <button
          type="button"
          className="btn-primary text-sm w-full"
          onClick={() => void generateReport()}
          disabled={loading || !date}
        >
          {loading ? "Generating…" : "Generate report"}
        </button>

        {!reportReady && !loading && (
          <p className="text-[11px] text-slate-500">
            Choose date → department / category → PDF or CSV → Generate report
            (downloads the file; preview appears below).
          </p>
        )}
      </div>

      {loading && <p className="text-sm text-slate-500">Generating…</p>}
      {err && <p className="text-sm text-rose-600">{err}</p>}

      {reportReady && !loading && report && (
        <>
          <div className="no-print grid grid-cols-2 gap-3">
            <div className="card p-3 col-span-2">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">
                Grand total
              </p>
              <p className="text-xl font-bold text-emerald-700">
                {formatAed(report.grand_total)}
              </p>
              <p className="text-[10px] text-slate-500">
                As of {report.as_of} · {scopeLabel}
                {generated?.location ? ` · ${generated.location}` : ""}
                {generated?.category ? ` · ${generated.category}` : ""} ·{" "}
                {report.row_count} lines
              </p>
            </div>
            {report.by_department.map((d) => (
              <div key={d.department} className="card p-3">
                <p className="text-[10px] uppercase text-slate-500 font-semibold truncate">
                  {d.department}
                </p>
                <p className="text-base font-bold text-emerald-800">
                  {formatAed(d.value_sum)}
                </p>
                <p className="text-[10px] text-slate-500">
                  {d.line_count} lines · qty {fmtQty(d.qty_sum)}
                </p>
              </div>
            ))}
          </div>

          {report.rows.length === 0 ? (
            <p className="text-sm text-slate-500 card p-4">
              No stock with quantity greater than zero for these filters.
            </p>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Product</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold">Department</th>
                      <th className="px-3 py-2 font-semibold text-right">Qty</th>
                      <th className="px-3 py-2 font-semibold text-right">
                        Unit AED
                      </th>
                      <th className="px-3 py-2 font-semibold text-right">
                        Value AED
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.rows.map((r, i) => (
                      <tr key={`${r.product_id}-${r.department}-${i}`}>
                        <td className="px-3 py-2 font-medium max-w-[10rem] truncate">
                          {r.product}
                        </td>
                        <td className="px-3 py-2 text-slate-600 max-w-[8rem] truncate">
                          {r.category}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {r.department}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtQty(r.qty)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatAed(r.unit_price)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-800">
                          {formatAed(r.line_value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-50/80 font-bold">
                      <td className="px-3 py-2" colSpan={3}>
                        Grand total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtQty(report.grand_qty)}
                      </td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-800">
                        {formatAed(report.grand_total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
