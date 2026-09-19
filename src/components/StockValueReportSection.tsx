"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LOCATIONS } from "@/lib/types";
import {
  getStockGroup,
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

function defaultDateRange(storedFrom?: string | null) {
  const to = ymdInDubai();
  const from =
    storedFrom && /^\d{4}-\d{2}-\d{2}$/.test(storedFrom)
      ? storedFrom
      : `${to.slice(0, 7)}-01`;
  return { from, to };
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

type MainFormat = "pdf" | "excel";
type LegacyFormat = "pdf" | "csv";
type ScopeValue = "" | StockGroup;

type GeneratedMeta = {
  date: string;
  location: string;
  category: string;
  scope: ScopeValue;
  includeZero: boolean;
  format: LegacyFormat;
};

const SCOPE_OPTIONS: { value: ScopeValue; label: string }[] = [
  { value: "products", label: "Products" },
  { value: "consumables", label: "Consumables" },
  { value: "crash_cart", label: "Crash Cart" },
  { value: "", label: "All" },
];

export default function StockValueReportSection() {
  const initial = useMemo(() => defaultDateRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  /** Default Scope = Products so Crash Cart does not dominate. */
  const [scope, setScope] = useState<ScopeValue>("products");
  const [mainFormat, setMainFormat] = useState<MainFormat>("pdf");
  const [locations, setLocations] = useState<string[]>([...LOCATIONS]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryMeta, setCategoryMeta] = useState<Record<string, StockGroup>>(
    {}
  );
  const [mainLoading, setMainLoading] = useState(false);
  const [mainErr, setMainErr] = useState<string | null>(null);

  // Legacy short pivot (collapsed)
  const [date, setDate] = useState(() => ymdInDubai());
  const [includeZero, setIncludeZero] = useState(false);
  const [format, setFormat] = useState<LegacyFormat>("pdf");
  const [report, setReport] = useState<StockValueReport | null>(null);
  const [generated, setGenerated] = useState<GeneratedMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rangeInvalid = !from || !to || from > to;

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
        const [prodRes, settingsRes, metaRes] = await Promise.all([
          fetch("/api/products", { credentials: "include" }),
          fetch("/api/settings", { credentials: "include" }),
          fetch("/api/reports/main-store-stock", { credentials: "include" }),
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
        if (metaRes.ok) {
          const m = await metaRes.json();
          if (!cancelled && m?.default_from) {
            const r = defaultDateRange(String(m.default_from));
            setFrom(r.from);
            setTo(r.to);
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
    generated.scope === scope &&
    generated.includeZero === includeZero;

  const buildLegacyQuery = useCallback(() => {
    const q = new URLSearchParams();
    if (date) q.set("date", date);
    if (location) q.set("location", location);
    if (category) q.set("category", category);
    if (scope) q.set("group", scope);
    if (includeZero) q.set("includeZero", "1");
    return q.toString();
  }, [date, location, category, scope, includeZero]);

  const buildMainQuery = useCallback(() => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (location) q.set("location", location);
    if (category) q.set("category", category);
    if (scope) q.set("group", scope);
    else q.set("group", "");
    return q.toString();
  }, [from, to, location, category, scope]);

  const generateReport = async (formatOverride?: LegacyFormat) => {
    const fmt: LegacyFormat = formatOverride ?? format;
    if (!date) {
      setErr("Select a date");
      setReport(null);
      setGenerated(null);
      return;
    }
    if (fmt !== "pdf" && fmt !== "csv") {
      setErr("Select PDF or CSV format");
      return;
    }

    setFormat(fmt);
    setLoading(true);
    setErr(null);
    const qs = `${buildLegacyQuery()}&v=3`;
    const downloadPath =
      fmt === "pdf"
        ? `/api/reports/stock-value.pdf?${qs}`
        : `/api/reports/stock-value.csv?${qs}`;
    const filename =
      fmt === "pdf"
        ? `current-stock-${date}.pdf`
        : `current-stock-${date}.csv`;

    try {
      const [dlRes, jsonRes] = await Promise.all([
        fetch(downloadPath, { credentials: "include", cache: "no-store" }),
        fetch(`/api/reports/stock-value?${qs}`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const ct = dlRes.headers.get("content-type") || "";
      const looksOk =
        dlRes.ok &&
        ((fmt === "pdf" && ct.includes("application/pdf")) ||
          (fmt === "csv" &&
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
          `${fmt === "pdf" ? "PDF" : "CSV"} download failed: ${message}`
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
          setGenerated({
            date,
            location,
            category,
            scope,
            includeZero,
            format: fmt,
          });
        } catch {
          setReport(null);
          setGenerated({
            date,
            location,
            category,
            scope,
            includeZero,
            format: fmt,
          });
        }
      } else {
        setReport(null);
        setGenerated({
          date,
          location,
          category,
          scope,
          includeZero,
          format: fmt,
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

  const scopeLabel =
    SCOPE_OPTIONS.find((o) => o.value === (generated?.scope ?? scope))
      ?.label || "All";

  const locCols = report?.location_columns ?? [];
  const locHeaders = report?.location_headers ?? [];

  const generateMainStore = useCallback(async () => {
    if (!from || !to) {
      setMainErr("Select From and To dates");
      return;
    }
    if (from > to) {
      setMainErr("From must be on or before To");
      return;
    }
    setMainLoading(true);
    setMainErr(null);
    try {
      const qs = buildMainQuery();
      const path =
        mainFormat === "excel"
          ? `/api/reports/main-store-stock.xlsx?${qs}`
          : `/api/reports/main-store-stock.pdf?${qs}`;
      const res = await fetch(path, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        let msg = `Generate failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const ct = res.headers.get("content-type") || "";
      const looksOk =
        mainFormat === "pdf"
          ? ct.includes("application/pdf")
          : ct.includes("spreadsheetml") ||
            ct.includes("octet-stream") ||
            ct.includes("application/vnd.openxmlformats");
      if (!looksOk) {
        throw new Error(
          `${mainFormat === "excel" ? "Excel" : "PDF"} download failed (unexpected type)`
        );
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = /filename="([^"]+)"/.exec(cd);
      const filename =
        m?.[1] ||
        (mainFormat === "excel"
          ? `Main_Store_Stock_Report_${from}_to_${to}.xlsx`
          : `Main_Store_Stock_Report_${from}_to_${to}.pdf`);
      triggerBlobDownload(blob, filename);
    } catch (e) {
      setMainErr(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setMainLoading(false);
    }
  }, [from, to, mainFormat, buildMainQuery]);

  return (
    <section id="current-stock-report" className="space-y-4 report-page">
      <div className="no-print">
        <h2 className="text-lg font-bold text-[#5C2D91]">
          Main Store Stock Report
        </h2>
        <p className="text-xs text-slate-500">
          Full purple 9-page inventory (all SKUs, Normal status — never OK).
          From = previous count date; To = current snapshot. Movement = To vs
          From. Crash cart excluded when Scope is Products.
        </p>
      </div>

      <div className="no-print card p-4 space-y-3 border-2 border-[#5C2D91]/40">
        {/* 1. From / To */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ms-from">
              From
            </label>
            <input
              id="ms-from"
              type="date"
              className="input"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="ms-to">
              To
            </label>
            <input
              id="ms-to"
              type="date"
              className="input"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-500 -mt-1">
          From = previous count date · To = current snapshot date (live stock
          quantities). Defaults: last saved snapshot → today, or 1st of month →
          today.
        </p>

        {/* 2. Department / category / scope */}
        <div>
          <label className="label" htmlFor="ms-department">
            Department
          </label>
          <select
            id="ms-department"
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

        <div>
          <label className="label" htmlFor="ms-category">
            Category
          </label>
          <select
            id="ms-category"
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

        <div>
          <label className="label" htmlFor="ms-scope">
            Scope
          </label>
          <select
            id="ms-scope"
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
        </div>

        {/* 3. Format PDF | Excel */}
        <div>
          <p className="label mb-1.5">Format</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                mainFormat === "pdf"
                  ? "border-[#5C2D91] bg-purple-50 text-[#5C2D91]"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
              onClick={() => setMainFormat("pdf")}
            >
              PDF
            </button>
            <button
              type="button"
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                mainFormat === "excel"
                  ? "border-[#5C2D91] bg-purple-50 text-[#5C2D91]"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
              onClick={() => setMainFormat("excel")}
            >
              Excel
            </button>
          </div>
        </div>

        {/* 4. Generate */}
        <button
          type="button"
          className="btn-primary text-sm w-full bg-[#5C2D91] hover:bg-[#4A2475]"
          onClick={() => void generateMainStore()}
          disabled={mainLoading || rangeInvalid}
        >
          {mainLoading ? "Generating…" : "Generate report"}
        </button>
        {mainErr && <p className="text-sm text-rose-600">{mainErr}</p>}
        <p className="text-[11px] text-slate-500">
          Sequence: From/To → category/department/scope → PDF or Excel →
          Generate. Primary clinic inventory report (full SKUs).
        </p>
      </div>

      <details className="no-print card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Advanced: legacy current-stock pivot (short table, OK / AED)
        </summary>
        <p className="mt-2 text-xs text-slate-500 mb-3">
          Optional filtered pivot — not the Main Store 9-page report.
        </p>

        <div className="no-print card p-4 space-y-3">
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
          </div>

          <p className="text-[11px] text-slate-500">
            Uses Department / Category / Scope from Main Store filters above.
          </p>

          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={includeZero}
              onChange={(e) => setIncludeZero(e.target.checked)}
            />
            <span>
              <span className="font-medium">Include zero stock</span>
              <span className="block text-[11px] text-slate-500">
                Off by default — only products with total qty &gt; 0.
              </span>
            </span>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary text-sm flex-1"
              onClick={() => void generateReport("pdf")}
              disabled={loading || !date}
            >
              {loading && format === "pdf" ? "Generating…" : "Legacy PDF"}
            </button>
            <button
              type="button"
              className="btn-secondary text-sm flex-1"
              onClick={() => void generateReport("csv")}
              disabled={loading || !date}
            >
              {loading && format === "csv" ? "Generating…" : "Legacy CSV"}
            </button>
          </div>
        </div>
      </details>

      {loading && <p className="text-sm text-slate-500">Generating…</p>}
      {err && <p className="text-sm text-rose-600">{err}</p>}

      {reportReady && !loading && report && (
        <>
          <div className="no-print grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card p-3">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">
                SKU lines
              </p>
              <p className="text-xl font-bold text-[#482980]">
                {report.row_count}
              </p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">
                Total qty
              </p>
              <p className="text-xl font-bold">{fmtQty(report.grand_qty)}</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">
                Total value
              </p>
              <p className="text-xl font-bold text-emerald-700">
                {formatAed(report.grand_total)}
              </p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">
                Expired / soon
              </p>
              <p className="text-xl font-bold">
                <span className="text-rose-700">{report.expired_count}</span>
                <span className="text-slate-400"> / </span>
                <span className="text-amber-700">
                  {report.expiring_soon_count}
                </span>
              </p>
            </div>
            <div className="card p-3 col-span-2 sm:col-span-4">
              <p className="text-[10px] text-slate-500">
                As of {report.as_of} · {scopeLabel}
                {generated?.location ? ` · ${generated.location}` : ""}
                {generated?.category ? ` · ${generated.category}` : ""}
                {generated?.includeZero ? " · incl. zero" : ""}
              </p>
            </div>
          </div>

          {report.rows.length === 0 ? (
            <p className="text-sm text-slate-500 card p-4">
              {report.include_zero
                ? "No products match these filters."
                : "No stock with quantity greater than zero for these filters."}
            </p>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto -mx-0">
                <table className="min-w-max w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#482980] text-white uppercase tracking-wide">
                      <th className="px-2 py-2 font-semibold sticky left-0 z-20 bg-[#482980] min-w-[7rem]">
                        Category
                      </th>
                      <th className="px-2 py-2 font-semibold sticky left-[7rem] z-20 bg-[#482980] min-w-[9rem]">
                        Product
                      </th>
                      <th className="px-2 py-2 font-semibold whitespace-nowrap">
                        Expiry
                      </th>
                      <th className="px-2 py-2 font-semibold whitespace-nowrap">
                        Status
                      </th>
                      <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">
                        Total
                      </th>
                      <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">
                        Total value (AED)
                      </th>
                      {locHeaders.map((h, i) => (
                        <th
                          key={locCols[i] || h}
                          className="px-2 py-2 font-semibold text-right whitespace-nowrap"
                          title={locCols[i]}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r, i) => (
                      <tr
                        key={r.product_id}
                        className={i % 2 === 1 ? "bg-slate-50" : "bg-white"}
                      >
                        <td
                          className={`px-2 py-1.5 max-w-[10rem] truncate border-b border-slate-100 sticky left-0 z-10 ${
                            i % 2 === 1 ? "bg-slate-50" : "bg-white"
                          }`}
                        >
                          {r.category}
                        </td>
                        <td
                          className={`px-2 py-1.5 font-medium max-w-[12rem] truncate border-b border-slate-100 sticky left-[7rem] z-10 ${
                            i % 2 === 1 ? "bg-slate-50" : "bg-white"
                          }`}
                        >
                          {r.product}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap border-b border-slate-100">
                          {r.expiry || "—"}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap border-b border-slate-100">
                          {r.status}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums border-b border-slate-100">
                          {fmtQty(r.total_qty)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-800 border-b border-slate-100 whitespace-nowrap">
                          {formatAed(r.total_value)}
                        </td>
                        {locCols.map((loc) => (
                          <td
                            key={loc}
                            className="px-2 py-1.5 text-right tabular-nums border-b border-slate-100"
                          >
                            {fmtQty(r.qty_by_location?.[loc] ?? 0)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#482980]/10 font-bold">
                      <td
                        className="px-2 py-2 sticky left-0 z-10 bg-[#ece8f4]"
                        colSpan={2}
                      >
                        Grand total
                      </td>
                      <td className="px-2 py-2" />
                      <td className="px-2 py-2" />
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmtQty(report.grand_qty)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-emerald-800 whitespace-nowrap">
                        {formatAed(report.grand_total)}
                      </td>
                      {report.by_department.map((d) => (
                        <td
                          key={d.department}
                          className="px-2 py-2 text-right tabular-nums"
                        >
                          {fmtQty(d.qty_sum)}
                        </td>
                      ))}
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
