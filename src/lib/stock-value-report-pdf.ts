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

type Col = { key: string; x: number; w: number; label: string; align: "left" | "right" };

/**
 * Build column layout for pivot table:
 * CATEGORY | PRODUCT | EXPIRY | STATUS | TOTAL | VALUE | MAIN | AHMAD | …
 */
function buildColumns(
  report: StockValueReport,
  marginX: number,
  contentWidth: number
): Col[] {
  const locCount = Math.max(report.location_columns.length, 1);
  const fixed = [
    { key: "category", label: "CATEGORY", prefer: 95, min: 70, align: "left" as const },
    { key: "product", label: "PRODUCT", prefer: 150, min: 100, align: "left" as const },
    { key: "expiry", label: "EXPIRY", prefer: 48, min: 40, align: "left" as const },
    { key: "status", label: "STATUS", prefer: 78, min: 60, align: "left" as const },
    { key: "total", label: "TOTAL", prefer: 40, min: 32, align: "right" as const },
    { key: "value", label: "VALUE AED", prefer: 68, min: 55, align: "right" as const },
  ];
  const locPrefer = locCount <= 5 ? 48 : locCount <= 7 ? 40 : 34;
  const locMin = 28;

  const fixedPrefer = fixed.reduce((s, c) => s + c.prefer, 0);
  const locPreferTotal = locPrefer * locCount;
  const totalPrefer = fixedPrefer + locPreferTotal;
  const scale = contentWidth / totalPrefer;

  const cols: Col[] = [];
  let x = marginX + 2;
  for (const f of fixed) {
    const w = Math.max(f.min, f.prefer * scale);
    cols.push({ key: f.key, x, w, label: f.label, align: f.align });
    x += w;
  }
  for (let i = 0; i < report.location_columns.length; i++) {
    const w = Math.max(locMin, locPrefer * scale);
    cols.push({
      key: `loc:${report.location_columns[i]}`,
      x,
      w,
      label: report.location_headers[i] || locationFallback(i),
      align: "right",
    });
    x += w;
  }
  return cols;
}

function locationFallback(i: number): string {
  return `L${i + 1}`;
}

/** Build a multi-page landscape current-stock pivot PDF (qty, value, expiry). */
export async function stockValueReportToPdf(
  report: StockValueReport
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = A4_LANDSCAPE.width;
  const pageHeight = A4_LANDSCAPE.height;
  const marginX = 22;
  const footerH = 22;
  const bottomLimit = footerH + 10;
  const contentRight = pageWidth - marginX;
  const contentWidth = contentRight - marginX;

  const cols = buildColumns(report, marginX, contentWidth);
  const colByKey = (key: string) => cols.find((c) => c.key === key)!;

  const tableHeaderH = 18;
  const rowH = 13;
  const fontSize = 7;

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
    for (const c of cols) {
      if (c.align === "right") {
        drawRight(c.label, c.x + c.w - 3, hy, 6.5, true, WHITE);
      } else {
        drawTextAt(c.label, c.x, hy, 6.5, true, WHITE, c.w - 2);
      }
    }
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

  drawTextAt(
    report.filters_label || "All locations / categories",
    marginX,
    y,
    8,
    false,
    MUTED
  );
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
      report.include_zero
        ? "No products match these filters."
        : "No stock with quantity greater than zero for these filters.",
      marginX,
      y,
      10
    );
    drawFooter(page, pageNum);
    return doc.save();
  }

  drawTableHeader();

  let rowIndex = 0;
  for (const r of report.rows) {
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

    const cat = colByKey("category");
    const prod = colByKey("product");
    const exp = colByKey("expiry");
    const st = colByKey("status");
    const tot = colByKey("total");
    const val = colByKey("value");

    drawTextAt(r.category, cat.x, y, fontSize, false, TEXT, cat.w - 2);
    drawTextAt(r.product, prod.x, y, fontSize, false, TEXT, prod.w - 2);
    drawTextAt(r.expiry || "—", exp.x, y, fontSize, false, TEXT, exp.w - 2);
    drawTextAt(r.status, st.x, y, fontSize, false, TEXT, st.w - 2);
    drawRight(fmtQty(r.total_qty), tot.x + tot.w - 3, y, fontSize);
    drawRight(fmtMoney(r.total_value), val.x + val.w - 3, y, fontSize, true);

    for (const loc of report.location_columns) {
      const c = colByKey(`loc:${loc}`);
      if (!c) continue;
      drawRight(
        fmtQty(r.qty_by_location[loc] || 0),
        c.x + c.w - 3,
        y,
        fontSize
      );
    }

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
  drawTextAt("GRAND TOTAL", colByKey("category").x, y, 8, true, WHITE);
  drawRight(
    fmtQty(report.grand_qty),
    colByKey("total").x + colByKey("total").w - 3,
    y,
    8,
    true,
    WHITE
  );
  drawRight(
    `AED ${fmtMoney(report.grand_total)}`,
    colByKey("value").x + colByKey("value").w - 3,
    y,
    8,
    true,
    WHITE
  );
  for (const d of report.by_department) {
    const c = colByKey(`loc:${d.department}`);
    if (!c) continue;
    drawRight(fmtQty(d.qty_sum), c.x + c.w - 3, y, 7, true, WHITE);
  }
  y -= rowH + 10;

  drawFooter(page, pageNum);
  return doc.save();
}
