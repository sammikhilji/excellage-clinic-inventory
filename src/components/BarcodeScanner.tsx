"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onScan: (code: string) => void;
  onManual?: (code: string) => void;
  active?: boolean;
};

export default function BarcodeScanner({ onScan, onManual, active = true }: Props) {
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function start() {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
          "html5-qrcode"
        );
        if (cancelled) return;
        const elId = "qr-reader";
        const scanner = new Html5Qrcode(elId, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.RSS_14,
            Html5QrcodeSupportedFormats.RSS_EXPANDED,
          ],
          useBarCodeDetectorIfSupported: true,
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // Square viewfinder suits QR stickers and Data Matrix equally
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decoded) => {
            const now = Date.now();
            if (
              decoded === lastRef.current.code &&
              now - lastRef.current.at < 2000
            ) {
              return;
            }
            lastRef.current = { code: decoded, at: now };
            onScanRef.current(decoded.trim());
          },
          () => {}
        );
        if (!cancelled) setReady(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError(
            "Camera unavailable. Allow camera permission, use HTTPS/localhost, or type the barcode below."
          );
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop().catch(() => {});
      }
    };
  }, [active]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    if (onManual) onManual(code);
    else onScan(code);
  }

  return (
    <div className="space-y-3">
      <div className="card overflow-hidden p-2">
        <div id="qr-reader" className="min-h-[220px] w-full bg-slate-900 rounded-xl" />
        {!ready && !error && (
          <p className="py-2 text-center text-xs text-slate-500">Starting camera…</p>
        )}
      </div>
      {error && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          {error}
        </div>
      )}
      <p className="text-[11px] text-slate-500 text-center">
        Point at a square Data Matrix, QR sticker, or linear barcode — or type INV-#### / GTIN below.
      </p>
      <form onSubmit={submitManual} className="flex gap-2">
        <input
          className="input"
          placeholder="Or type INV-0007 / GTIN…"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
        />
        <button type="submit" className="btn-primary shrink-0 px-4">
          Go
        </button>
      </form>
    </div>
  );
}
