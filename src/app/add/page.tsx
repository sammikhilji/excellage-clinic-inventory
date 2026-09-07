"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
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

function AddInner() {
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
        <h2 className="text-lg font-bold">Add stock</h2>
        <p className="text-sm text-slate-500">
          Scan or enter a barcode, then increase quantity at a location.
        </p>
        <p className="mt-1 text-xs">
          <Link href="/products/new" className="font-semibold text-brand-700">
            Need a brand-new product? Add product →
          </Link>
        </p>
      </div>

      {scanning && !product && (
        <BarcodeScanner onScan={loadBarcode} />
      )}

      {msg && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 space-y-2">
          <p>{msg}</p>
          <Link href="/products/new" className="inline-flex font-semibold text-emerald-800 underline">
            Create a new product instead →
          </Link>
        </div>
      )}

      {product && (
        <StockForm
          mode="receive"
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

export default function AddPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <AddInner />
    </Suspense>
  );
}
