import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toWinAnsi } from "./monthly-staff-report-pdf";
import type { StockValueReport } from "./stock-value-report";

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

/** Build a multi-page stock value report PDF (WinAnsi-safe). */
export async function stockValueReportToPdf(
  report: StockValueReport
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 36;
  const fontSize = 8;
  const titleSize = 12;
  const lineHeight = 11;
  const bottomLimit = margin + 24;

  // Column x positions
  const col = {
    product: margin,
    category: margin + 150,
    dept: margin + 250,
    qty: margin + 340,
    price: margin + 390,
    value: margin + 460,
  };
  const productMaxW = 145;
  const categoryMaxW = 95;
  const deptMaxW = 85;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let pageNum = 1;

  const ensureSpace = (needed: number) => {
    if (y - needed < bottomLimit) {
      drawFooter();
      page = doc.addPage([pageWidth, pageHeight]);
      pageNum += 1;
      y = pageHeight - margin;
      drawTableHeader();
    }
  };

  const drawText = (
    text: string,
    x: number,
    size: number,
    bold = false,
    color = rgb(0.1, 0.1, 0.15)
  ) => {
    const f = bold ? fontBold : font;
    const safe = toWinAnsi(text);
    if (!safe) return;
    page.drawText(safe, { x, y, size, font: f, color });
  };

  const truncate = (text: string, maxWidth: number, size: number): string => {
    const f = font;
    const safe = toWinAnsi(text);
    if (f.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
    let s = safe;
    while (s.length > 1 && f.widthOfTextAtSize(s + "...", size) > maxWidth) {
      s = s.slice(0, -1);
    }
    return s + "...";
  };

  const drawFooter = () => {
    const label = toWinAnsi(`Page ${pageNum}`);
    page.drawText(label, {
      x: pageWidth - margin - font.widthOfTextAtSize(label, 8),
      y: margin - 8,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.55),
    });
  };

  const drawTableHeader = () => {
    ensureSpace(lineHeight * 2);
    drawText("Product", col.product, fontSize, true);
    drawText("Category", col.category, fontSize, true);
    drawText("Department", col.dept, fontSize, true);
    drawText("Qty", col.qty, fontSize, true);
    drawText("Unit AED", col.price, fontSize, true);
    drawText("Value AED", col.value, fontSize, true);
    y -= 4;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.6,
      color: rgb(0.6, 0.6, 0.65),
    });
    y -= lineHeight;
  };

  // Title
  drawText("Clinic Inventory - Stock value report", margin, titleSize, true);
  y -= lineHeight + 2;
  drawText(`As of ${report.as_of}`, margin, 9);
  y -= lineHeight;
  drawText(report.filters_label, margin, 8, false, rgb(0.35, 0.35, 0.4));
  y -= lineHeight;
  drawText(
    `Grand total: AED ${fmtMoney(report.grand_total)}  ·  ${report.row_count} lines  ·  Qty ${fmtQty(report.grand_qty)}`,
    margin,
    9,
    true,
    rgb(0.05, 0.35, 0.2)
  );
  y -= lineHeight + 6;

  if (report.rows.length === 0) {
    drawText("No stock with quantity greater than zero for these filters.", margin, 10);
    drawFooter();
    return doc.save();
  }

  drawTableHeader();

  let lastDept = "";
  for (const r of report.rows) {
    if (r.department !== lastDept) {
      lastDept = r.department;
      ensureSpace(lineHeight + 4);
      drawText(r.department, margin, 9, true, rgb(0.15, 0.25, 0.45));
      y -= lineHeight;
    }
    ensureSpace(lineHeight);
    drawText(truncate(r.product, productMaxW, fontSize), col.product, fontSize);
    drawText(truncate(r.category, categoryMaxW, fontSize), col.category, fontSize);
    drawText(truncate(r.department, deptMaxW, fontSize), col.dept, fontSize);
    drawText(fmtQty(r.qty), col.qty, fontSize);
    drawText(fmtMoney(r.unit_price), col.price, fontSize);
    drawText(fmtMoney(r.line_value), col.value, fontSize);
    y -= lineHeight;
  }

  // Department subtotals
  y -= 6;
  ensureSpace(lineHeight * (report.by_department.length + 4));
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.75),
  });
  y -= lineHeight;
  drawText("Subtotals by department", margin, 10, true);
  y -= lineHeight;
  for (const d of report.by_department) {
    ensureSpace(lineHeight);
    drawText(
      `${d.department}:  AED ${fmtMoney(d.value_sum)}  (${d.line_count} lines, qty ${fmtQty(d.qty_sum)})`,
      margin + 8,
      fontSize
    );
    y -= lineHeight;
  }
  y -= 4;
  ensureSpace(lineHeight);
  drawText(
    `GRAND TOTAL: AED ${fmtMoney(report.grand_total)}`,
    margin,
    11,
    true,
    rgb(0.05, 0.35, 0.2)
  );

  drawFooter();
  return doc.save();
}
