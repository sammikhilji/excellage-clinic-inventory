import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { toWinAnsi } from "./monthly-staff-report-pdf";
import type { StockValueReport } from "./stock-value-report";
import {
  A4_LANDSCAPE,
  KPI_FILLS,
  KPI_TEXT,
  MUTED,
  PURPLE,
  PURPLE_DARK,
  ROW_LINE,
  TEXT,
  WHITE,
  ZEBRA,
} from "./report-theme";

function fmtQty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "") || "0";
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Build a multi-page landscape current-stock snapshot PDF (qty, value, expiry). */
export async function stockValueReportToPdf(
  report: StockValueReport
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = A4_LANDSCAPE.width;
  const pageHeight = A4_LANDSCAPE.height;
  const marginX = 28;
  const footerH = 22;
  const bottomLimit = footerH + 10;
  const contentRight = pageWidth - marginX;
  const contentWidth = contentRight - marginX;

  const cols = {
    product: { x: marginX + 4, w: 210 },
    category: { x: marginX + 218, w: 120 },
    dept: { x: marginX + 342, w: 130 },
    qty: { x: marginX + 476, w: 55 },
    value: { x: marginX + 535, w: 100 },
    expiry: { x: marginX + 640, w: 110 },
  };
  const tableHeaderH = 18;
  const rowH = 14;
  const fontSize = 8;

  let page: PDFPage = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 18;
  let pageNum = 1;

  const drawTextAt = (
    text: string,
    x: number,
    yPos: number,
    size: number,
    bold = false,
    color = TEXT,
    maxW?: number
  ) => {
    const f = bold ? fontBold : font;
    let safe = toWinAnsi(text);
    if (!safe) return;
    if (maxW != null && f.widthOfTextAtSize(safe, size) > maxW) {
      while (safe.length > 1 && f.widthOfTextAtSize(safe + "...", size) > maxW) {
        safe = safe.slice(0, -1);
      }
      safe = safe + "...";
    }
    page.drawText(safe, { x, y: yPos, size, font: f, color });
  };

  const drawRight = (
    text: string,
    rightX: number,
    yPos: number,
    size: number,
    bold = false,
    color = TEXT
  ) => {
    const f = bold ? fontBold : font;
    const safe = toWinAnsi(text);
    if (!safe) return;
    const w = f.widthOfTextAtSize(safe, size);
    page.drawText(safe, { x: rightX - w, y: yPos, size, font: f, color });
  };

  const drawFooter = (p: PDFPage, num: number) => {
    p.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: footerH,
      color: PURPLE_DARK,
    });
    const left = toWinAnsi(
      `Confidential clinic inventory · Current stock · as of ${report.as_of}`
    );
    p.drawText(left, {
      x: marginX,
      y: 7,
      size: 7,
      font,
      color: WHITE,
    });
    const right = toWinAnsi(`Page ${num}`);
    p.drawText(right, {
      x: pageWidth - marginX - font.widthOfTextAtSize(right, 7),
      y: 7,
      size: 7,
      font,
      color: WHITE,
    });
  };

  const drawTableHeader = () => {
    page.drawRectangle({
      x: marginX,
      y: y - tableHeaderH + 4,
      width: contentWidth,
      height: tableHeaderH,
      color: PURPLE,
    });
    const hy = y - 8;
    drawTextAt("PRODUCT", cols.product.x, hy, 7, true, WHITE, cols.product.w - 2);
    drawTextAt("CATEGORY", cols.category.x, hy, 7, true, WHITE, cols.category.w - 2);
    drawTextAt("DEPARTMENT", cols.dept.x, hy, 7, true, WHITE, cols.dept.w - 2);
    drawTextAt("QTY", cols.qty.x, hy, 7, true, WHITE, cols.qty.w - 2);
    drawTextAt("TOTAL VALUE", cols.value.x, hy, 7, true, WHITE, cols.value.w - 2);
    drawTextAt("EXPIRY", cols.expiry.x, hy, 7, true, WHITE, cols.expiry.w - 2);
    y -= tableHeaderH + 2;
  };

  const newPage = (withHeader: boolean) => {
    drawFooter(page, pageNum);
    page = doc.addPage([pageWidth, pageHeight]);
    pageNum += 1;
    page.drawRectangle({
      x: 0,
      y: pageHeight - 16,
      width: pageWidth,
      height: 16,
      color: PURPLE_DARK,
    });
    drawTextAt(
      `CURRENT STOCK REPORT · ${report.as_of} (cont.)`,
      marginX,
      pageHeight - 12,
      7,
      true,
      WHITE
    );
    y = pageHeight - 28;
    if (withHeader) drawTableHeader();
  };

  const ensureSpace = (needed: number, withHeader = false) => {
    if (y - needed < bottomLimit) newPage(withHeader);
  };

  // Top bar
  page.drawRectangle({
    x: 0,
    y: pageHeight - 18,
    width: pageWidth,
    height: 18,
    color: PURPLE_DARK,
  });
  drawTextAt(
    `CURRENT STOCK REPORT · ${report.as_of}`,
    marginX,
    pageHeight - 13,
    8,
    true,
    WHITE
  );
  const todayLabel = toWinAnsi(
    new Date().toLocaleDateString("en-AE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Dubai",
    })
  );
  page.drawText(todayLabel, {
    x: pageWidth - marginX - font.widthOfTextAtSize(todayLabel, 8),
    y: pageHeight - 13,
    size: 8,
    font,
    color: WHITE,
  });
  y = pageHeight - 22;

  page.drawRectangle({
    x: 0,
    y: y - 28,
    width: pageWidth,
    height: 28,
    color: PURPLE,
  });
  drawTextAt("CURRENT STOCK SUMMARY", marginX, y - 18, 12, true, WHITE);
  y -= 36;

  drawTextAt(report.filters_label || "All locations / categories", marginX, y, 8, false, MUTED);
  y -= 14;

  // KPI cards
  const kpis = [
    { value: `AED ${fmtMoney(report.grand_total)}`, label: "TOTAL VALUE" },
    { value: String(report.row_count), label: "SKU LINES" },
    { value: fmtQty(report.grand_qty), label: "TOTAL QTY" },
    {
      value: `${report.expired_count} / ${report.expiring_soon_count}`,
      label: "EXPIRED / SOON",
    },
  ];
  const gap = 8;
  const cardW = (contentWidth - gap * (kpis.length - 1)) / kpis.length;
  const cardH = 42;
  kpis.forEach((k, i) => {
    const x = marginX + i * (cardW + gap);
    page.drawRectangle({
      x,
      y: y - cardH,
      width: cardW,
      height: cardH,
      color: KPI_FILLS[i % KPI_FILLS.length],
    });
    const color = KPI_TEXT[i % KPI_TEXT.length];
    page.drawText(toWinAnsi(k.value), {
      x: x + 10,
      y: y - 20,
      size: 12,
      font: fontBold,
      color,
    });
    page.drawText(toWinAnsi(k.label), {
      x: x + 10,
      y: y - 34,
      size: 7,
      font: fontBold,
      color,
    });
  });
  y -= cardH + 12;

  if (report.rows.length === 0) {
    drawTextAt(
      "No stock with quantity greater than zero for these filters.",
      marginX,
      y,
      10
    );
    drawFooter(page, pageNum);
    return doc.save();
  }

  drawTableHeader();

  let lastDept = "";
  let rowIndex = 0;
  for (const r of report.rows) {
    if (r.department !== lastDept) {
      lastDept = r.department;
      ensureSpace(rowH + tableHeaderH, true);
      page.drawRectangle({
        x: marginX,
        y: y - 3,
        width: contentWidth,
        height: rowH,
        color: KPI_FILLS[0],
      });
      drawTextAt(r.department, marginX + 4, y, 8, true, PURPLE, contentWidth - 8);
      y -= rowH;
    }
    ensureSpace(rowH + 2, true);
    const zebra = rowIndex % 2 === 1;
    if (zebra) {
      page.drawRectangle({
        x: marginX,
        y: y - 3,
        width: contentWidth,
        height: rowH,
        color: ZEBRA,
      });
    }
    drawTextAt(r.product, cols.product.x, y, fontSize, false, TEXT, cols.product.w - 2);
    drawTextAt(r.category, cols.category.x, y, fontSize, false, TEXT, cols.category.w - 2);
    drawTextAt(r.department, cols.dept.x, y, fontSize, false, TEXT, cols.dept.w - 2);
    drawRight(fmtQty(r.qty), cols.qty.x + cols.qty.w - 4, y, fontSize);
    drawRight(fmtMoney(r.line_value), cols.value.x + cols.value.w - 4, y, fontSize, true);
    drawTextAt(
      r.expiry || "—",
      cols.expiry.x,
      y,
      fontSize,
      false,
      TEXT,
      cols.expiry.w - 2
    );
    page.drawLine({
      start: { x: marginX, y: y - 4 },
      end: { x: contentRight, y: y - 4 },
      thickness: 0.3,
      color: ROW_LINE,
    });
    y -= rowH;
    rowIndex += 1;
  }

  // Totals row
  ensureSpace(rowH * 2 + 8, false);
  y -= 4;
  page.drawRectangle({
    x: marginX,
    y: y - 3,
    width: contentWidth,
    height: rowH + 4,
    color: PURPLE,
  });
  drawTextAt("GRAND TOTAL", cols.product.x, y, 9, true, WHITE);
  drawRight(
    fmtQty(report.grand_qty),
    cols.qty.x + cols.qty.w - 4,
    y,
    9,
    true,
    WHITE
  );
  drawRight(
    `AED ${fmtMoney(report.grand_total)}`,
    cols.value.x + cols.value.w - 4,
    y,
    9,
    true,
    WHITE
  );
  y -= rowH + 10;

  if (report.by_department.length > 0) {
    ensureSpace(rowH * (report.by_department.length + 2), false);
    drawTextAt("Subtotals by department", marginX, y, 9, true, PURPLE);
    y -= rowH;
    for (const d of report.by_department) {
      ensureSpace(rowH, false);
      drawTextAt(
        `${d.department}:  AED ${fmtMoney(d.value_sum)}  (${d.line_count} lines, qty ${fmtQty(d.qty_sum)})`,
        marginX + 8,
        y,
        fontSize,
        false,
        TEXT,
        contentWidth - 16
      );
      y -= rowH;
    }
  }

  drawFooter(page, pageNum);
  return doc.save();
}
