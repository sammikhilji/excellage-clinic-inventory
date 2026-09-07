"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import BarcodeScanner from "@/components/BarcodeScanner";
import StockForm from "@/components/StockForm";

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

function ConsumeInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);

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
    } catch {
      setMsg("Failed to load product");
    }
  }

  useEffect(() => {
    const b = sp.get("barcode");
    if (b) loadBarcode(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Consumption / sale</h2>
        <p className="text-sm text-slate-500">
          Scan or enter a barcode, then decrease quantity (use or sale).
        </p>
      </div>

      {scanning && !product && <BarcodeScanner onScan={loadBarcode} />}

      {msg && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          {msg}
        </div>
      )}

      {product && (
        <StockForm
          mode="consumption"
          product={product}
          onCancel={() => {
            setProduct(null);
            setScanning(true);
          }}
          onDone={() => router.push(`/inventory/${product.id}`)}
        />
      )}
    </div>
  );
}

export default function ConsumePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <ConsumeInner />
    </Suspense>
  );
}
