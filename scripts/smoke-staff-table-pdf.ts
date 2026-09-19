/**
 * Smoke: build sample staff table PDF and assert table headers via pdftotext.
 * Usage: npx --yes tsx scripts/smoke-staff-table-pdf.ts
 */
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { reportToPdf } from "../src/lib/monthly-staff-report-pdf";
import type { MonthlyStaffReport } from "../src/lib/monthly-staff-report-types";

async function main() {
  const report: MonthlyStaffReport = {
    from: "2026-09-01",
    to: "2026-09-19",
    range_label: "1 Sep 2026 – 19 Sep 2026",
    year: 2026,
    month: 9,
    month_label: "1 Sep 2026 – 19 Sep 2026",
    staff: [
      {
        username: "francia",
        full_name: "Francia",
        display_name: "Francia",
        receives: [
          {
            date: "2026-09-05T10:00:00.000Z",
            product_name: "Gauze sterile",
            category: "Consumables",
            barcode: "123",
            qty: 10,
            to_location: "Main Store",
            type: "receive",
            note: "smoke",
          },
        ],
        transfers_from_main: [],
        consumptions: [],
        totals: {
          receive_qty_sum: 10,
          transfer_qty_sum: 0,
          consumption_qty_sum: 0,
          receive_count: 1,
          transfer_count: 0,
          consumption_count: 0,
        },
      },
    ],
    grand_totals: {
      staff_count: 1,
      receive_qty_sum: 10,
      receive_count: 1,
      transfer_qty_sum: 0,
      transfer_count: 0,
      consumption_qty_sum: 0,
      consumption_count: 0,
    },
  };

  const outPath = "/workspace/smoke-staff-table.pdf";

  const bytes = await reportToPdf(report);
  writeFileSync(outPath, bytes);
  console.log("Wrote", outPath, bytes.length, "bytes");

  // Also verify missing grand_totals does not throw
  const withoutTotals = {
    ...report,
    grand_totals: undefined as unknown as MonthlyStaffReport["grand_totals"],
  };
  await reportToPdf(withoutTotals);
  console.log("OK: missing grand_totals did not throw");

  const text = execSync(`pdftotext -layout ${outPath} -`, { encoding: "utf8" });
  const upper = text.toUpperCase();
  for (const needle of [
    "STAFF STOCK REPORT (TABLE)",
    "DATE",
    "PRODUCT",
    "CATEGORY",
  ]) {
    if (!upper.includes(needle)) {
      console.error("FAIL: missing", needle);
      console.error("--- pdf text ---\n", text);
      process.exit(1);
    }
  }
  console.log(
    "OK: pdftotext shows TABLE title and Date/Product/Category headers"
  );
  console.log("--- excerpt ---\n", text.slice(0, 600));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
