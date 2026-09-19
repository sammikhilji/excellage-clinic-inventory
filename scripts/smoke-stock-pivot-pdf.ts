/**
 * Smoke: build sample current-stock pivot PDF and assert MAIN/SALY headers.
 * Usage: npx --yes tsx scripts/smoke-stock-pivot-pdf.ts
 */
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildStockValueReport } from "../src/lib/stock-value-report";
import { stockValueReportToPdf } from "../src/lib/stock-value-report-pdf";
import { stockValueReportToCsv } from "../src/lib/stock-value-report";
import type { StoreData } from "../src/lib/db";

async function main() {
  const store: StoreData = {
    products: [
      {
        id: 1,
        barcode: "INV1",
        category: "DERMAL FILLERS",
        product: "Juvederm Volift",
        expiry: "Oct-26",
        status: "Expiring <=90 days",
        unit_type: "syringe",
        price: 100,
        total: 5.5,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        barcode: "INV2",
        category: "BOTOX",
        product: "Dysport 500 Units",
        expiry: "May-28",
        status: "OK",
        unit_type: "vial",
        price: 50,
        total: 75,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 3,
        barcode: "INV3",
        category: "Crash Cart Medication",
        product: "Epinephrine",
        expiry: null,
        status: "OK",
        unit_type: "vial",
        price: 10,
        total: 2,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    stock: [
      { id: 1, product_id: 1, location: "Main Store", qty: 5 },
      { id: 2, product_id: 1, location: "Dr. Saly", qty: 0.5 },
      { id: 3, product_id: 2, location: "Dr. Ahmad", qty: 73 },
      { id: 4, product_id: 2, location: "Dr. Saly", qty: 2 },
      { id: 5, product_id: 3, location: "Crash Cart Medication", qty: 2 },
    ],
    activity: [],
    users: [],
    locations: [
      "Main Store",
      "Dr. Ahmad",
      "Dr. Saly",
      "Dr. Niveen",
      "Dr. Sassani",
      "Crash Cart Medication",
    ],
    removed_usernames: [],
    nextIds: { products: 10, stock: 10, activity: 1, users: 1 },
  };

  const report = buildStockValueReport(store, "2026-09-19", {
    stockGroup: "products",
  });

  if (report.rows.some((r) => r.product === "Epinephrine")) {
    throw new Error("Crash cart product should be excluded when scope=products");
  }
  if (report.expired_count !== 0) {
    // no expired in sample
  }
  // Status "Expiring <=90 days" must normalize and count as soon
  if (report.expiring_soon_count < 1) {
    throw new Error(
      `Expected expiring_soon_count >= 1, got ${report.expiring_soon_count}`
    );
  }

  const headers = report.location_headers.join(",");
  console.log("location_headers:", headers);
  for (const h of ["MAIN", "AHMAD", "SALY", "NIVEEN", "SASSANI", "CRASH"]) {
    if (!report.location_headers.includes(h)) {
      throw new Error(`Missing header ${h} in ${headers}`);
    }
  }

  // One row per product (not product×dept)
  if (report.rows.length !== 2) {
    throw new Error(`Expected 2 product rows, got ${report.rows.length}`);
  }

  const bytes = await stockValueReportToPdf(report);
  const outPath = "/workspace/smoke-current-stock-pivot.pdf";
  writeFileSync(outPath, bytes);
  console.log("Wrote", outPath, bytes.length, "bytes");

  const csv = stockValueReportToCsv(report);
  writeFileSync("/workspace/smoke-current-stock-pivot.csv", csv);

  const text = execSync(`pdftotext -layout ${outPath} -`, { encoding: "utf8" });
  const upper = text.toUpperCase();
  for (const needle of [
    "CURRENT STOCK",
    "CATEGORY",
    "PRODUCT",
    "EXPIRY",
    "STATUS",
    "TOTAL",
    "MAIN",
    "SALY",
    "AHMAD",
  ]) {
    if (!upper.includes(needle)) {
      throw new Error(`PDF missing expected text: ${needle}`);
    }
  }
  for (const bad of ["STOCK ADDED", "TRANSFER FROM MAIN", "USE / SALE"]) {
    if (upper.includes(bad)) {
      throw new Error(`PDF must not contain transaction wording: ${bad}`);
    }
  }
  console.log("OK: pivot headers + no transaction wording");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
