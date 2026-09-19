import { readFileSync, writeFileSync } from "fs";
import { buildMainStoreReport } from "../src/lib/main-store-stock-report";
import { mainStoreReportToPdf } from "../src/lib/main-store-stock-report-pdf";
import type { StoreData } from "../src/lib/db";

async function main() {
  const raw = readFileSync("/workspace/clinic-inventory/data/store.json", "utf8");
  const store = JSON.parse(raw) as StoreData;
  const report = buildMainStoreReport(store, "2026-09-19");
  console.log({
    sku: report.sku_n,
    in: report.in_stock,
    oos: report.oos,
    used: report.used_total,
    units: report.units_now,
    new: report.new_skus,
    statusSample: report.rows.slice(0, 5).map((r) => [r.product, r.status, r.total]),
  });
  const hasOk = report.rows.some((r) => r.status === "OK");
  console.log("hasOK", hasOk);
  const pdf = await mainStoreReportToPdf(report);
  writeFileSync("/workspace/artifacts/app_main_store_test.pdf", pdf);
  console.log("pdf bytes", pdf.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
