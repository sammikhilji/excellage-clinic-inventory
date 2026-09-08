"use client";

import { useEffect, useState } from "react";
import { LOCATIONS, formatUnitLabel } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import { useAuth } from "./AuthGate";

type ProductInfo = {
  id: number;
  barcode: string;
  product: string;
  category: string;
  status: string;
  unit_type: string;
  total: number;
  holdings: { location: string; qty: number }[];
};

type Mode = "receive" | "consumption" | "sale";

type Props = {
  mode: Mode;
  product: ProductInfo;
  onDone: () => void;
  onCancel: () => void;
};

export default function StockForm({ mode, product, onDone, onCancel }: Props) {
  const { user } = useAuth();
  const [locations, setLocations] = useState<string[]>([...LOCATIONS]);
  const [location, setLocation] = useState<string>("Main Store");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [txnType, setTxnType] = useState<"consumption" | "sale">(
    mode === "sale" ? "sale" : "consumption"
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const type = mode === "receive" ? "receive" : txnType;
  const unit = formatUnitLabel(product.unit_type);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.locations) && d.locations.length) {
          setLocations(d.locations);
          if (!d.locations.includes(location)) {
            setLocation(d.locations[0]);
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const n = parseFloat(qty);
    if (!n || n <= 0) {
      setErr("Enter a positive quantity");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          location,
          qty: n,
          type,
          note: note || undefined,
          username: user?.username,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Failed");
        return;
      }
      setOk(true);
      setTimeout(onDone, 800);
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-4">
      <div>
        <p className="text-xs text-slate-500 font-mono">{product.barcode}</p>
        <h2 className="text-lg font-bold leading-snug">{product.product}</h2>
        <p className="text-sm text-slate-500">{product.category}</p>
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          <StatusBadge status={product.status} />
          <span className="text-sm text-slate-600">
            Total: <strong>{product.total}</strong> {unit}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {product.holdings?.map((h) => (
          <div key={h.location} className="rounded-lg bg-slate-50 px-2 py-1.5">
            <div className="text-slate-500 truncate">{h.location}</div>
            <div className="font-semibold">{h.qty}</div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode !== "receive" && (
          <div>
            <label className="label">Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`btn ${txnType === "consumption" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTxnType("consumption")}
              >
                Consumption
              </button>
              <button
                type="button"
                className={`btn ${txnType === "sale" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTxnType("sale")}
              >
                Sale
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="label">Location</label>
          <select className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Quantity ({unit})</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            step="any"
            min="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Note (optional)</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. patient / PO number"
          />
        </div>

        {err && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
            {err}
          </div>
        )}
        {ok && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
            Saved!
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`flex-1 ${mode === "receive" ? "btn-success" : "btn-danger"}`}
          >
            {busy
              ? "Saving…"
              : mode === "receive"
                ? "Add stock"
                : txnType === "sale"
                  ? "Record sale"
                  : "Record use"}
          </button>
        </div>
      </form>
    </div>
  );
}
