"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BarcodeScanner from "@/components/BarcodeScanner";

export default function ScanLookupPage() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCode(code: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(code)}`);
      if (!res.ok) {
        setMsg(`No product for “${code}”. Try INV-0007 or GTIN 07331689121391.`);
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
          Scan a product barcode (or GTIN) or type INV-XXXX to open its detail page.
        </p>
      </div>
      <BarcodeScanner onScan={handleCode} active={!busy} />
      {msg && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          {msg}
        </div>
      )}
    </div>
  );
}
