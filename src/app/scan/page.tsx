"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BarcodeScanner from "@/components/BarcodeScanner";

export default function ScanLookupPage() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCode(code: string) {
    setBusy(true);
    setMsg(null);
    setExtracted(null);
    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(code)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const gtin =
          data.extracted_gtin ||
          data.extracted_code ||
          data.code ||
          code;
        setExtracted(String(gtin));
        setMsg(
          `No product for this scan. Extracted code: ${gtin}. Create a new product with this GTIN, or open an existing product and tap Link barcode.`
        );
        return;
      }
      const p = await res.json();
      router.push(`/inventory/${p.id}`);
    } catch {
      setMsg("Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Lookup by barcode</h2>
        <p className="text-sm text-slate-500">
          Scan a Data Matrix, QR sticker, or linear barcode — or type INV-XXXX /
          GTIN — to open the product.
        </p>
      </div>
      <BarcodeScanner onScan={handleCode} active={!busy} />
      {msg && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 space-y-2">
          <p>{msg}</p>
          {extracted && (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/products/new?gtin=${encodeURIComponent(extracted)}`}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Create product with this code
              </Link>
              <Link
                href="/inventory"
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
              >
                Open stock list to link
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
