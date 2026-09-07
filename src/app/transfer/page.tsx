"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import BarcodeScanner from "@/components/BarcodeScanner";
import { LOCATIONS, formatUnitLabel } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/components/AuthGate";

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

function TransferInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [fromLocation, setFromLocation] = useState<string>("Main Store");
  const [toLocation, setToLocation] = useState<string>("Dr. Ahmad");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function loadBarcode(code: string) {
    setMsg(null);
    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(code)}`);
      if (!res.ok) {
        setMsg(`No product for “${code}”`);
        return;
      }
      const p = await res.json();
      setProduct(p);
      setScanning(false);
      const main = p.holdings?.find((h: { location: string; qty: number }) => h.location === "Main Store");
      if (main && main.qty > 0) setFromLocation("Main Store");
      else {
        const withStock = p.holdings?.find((h: { location: string; qty: number }) => h.qty > 0);
        if (withStock) setFromLocation(withStock.location);
      }
    } catch {
      setMsg("Failed to load product");
    }
  }

  useEffect(() => {
    const b = sp.get("barcode");
    if (b) loadBarcode(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const unit = formatUnitLabel(product?.unit_type);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    setErr(null);
    const n = parseFloat(qty);
    if (!n || n <= 0) {
      setErr("Enter a positive quantity");
      return;
    }
    if (fromLocation === toLocation) {
      setErr("Choose different FROM and TO locations");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          fromLocation,
          toLocation,
          qty: n,
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
      setTimeout(() => router.push(`/inventory/${product.id}`), 800);
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Transfer stock</h2>
        <p className="text-sm text-slate-500">
          Scan or enter a barcode, then move quantity from one location to another.
        </p>
      </div>

      {scanning && !product && <BarcodeScanner onScan={loadBarcode} />}

      {msg && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          {msg}
        </div>
      )}

      {product && (
        <div className="card p-4 space-y-4">
          <div>
            <p className="text-xs text-slate-500 font-mono">{product.barcode}</p>
            <h3 className="text-lg font-bold leading-snug">{product.product}</h3>
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
            <div>
              <label className="label">From</label>
              <select
                className="input"
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value)}
              >
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">To</label>
              <select
                className="input"
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
              >
                {LOCATIONS.map((l) => (
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
                placeholder="e.g. restock tray"
              />
            </div>
            {err && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
                {err}
              </div>
            )}
            {ok && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                Transferred!
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => {
                  setProduct(null);
                  setScanning(true);
                  setOk(false);
                  setErr(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={busy} className="btn-primary flex-1">
                {busy ? "Saving…" : "Confirm transfer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function TransferPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <TransferInner />
    </Suspense>
  );
}
