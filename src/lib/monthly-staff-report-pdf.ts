import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import type { MonthlyStaffReport, ReportLine } from "./monthly-staff-report-types";
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
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * pdf-lib StandardFonts (Helvetica) only encode WinAnsi / Windows-1252.
 * Replace common Unicode punctuation so drawText never throws.
 */
export function toWinAnsi(s: string): string {
  if (!s) return "";
  return (
    s
      .replace(/\u2014/g, "-") // —
      .replace(/\u2013/g, "-") // –
      .replace(/\u2212/g, "-") // −
      .replace(/\u2018|\u2019/g, "'") // ‘ ’
      .replace(/\u201C|\u201D/g, '"') // “ ”
      .replace(/\u2026/g, "...") // …
      .replace(/\u00A0/g, " ") // nbsp
      .replace(/\u2192/g, "->") // →
      .replace(/\u2190/g, "<-") // ←
      .replace(/\u2194/g, "<->") // ↔
      .replace(/\u2022/g, "*") // •
      .replace(/\u00B7/g, ".") // ·
      .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, (ch) => {
        const map: Record<string, string> = {
          "\u2248": "~",
          "\u2260": "!=",
          "\u2264": "<=",
          "\u2265": ">=",
          "\u00D7": "x",
          "\u00F7": "/",
        };
        return map[ch] ?? "";
      })
  );
}

type TableRow = {
  date: string;
  product: string;
  category: string;
  qty: string;
  location: string;
  type: string;
  note: string;
};

function lineLocation(r: ReportLine): string {
  if (r.to_location) return r.to_location;
  return r.location || "";
}

function typeLabel(kind: "receive" | "transfer" | "consumption", r: ReportLine): string {
  if (kind === "receive") return "Stock added";
  if (kind === "transfer") return "Transfer from Main";
  if (r.type === "sale") return "Sale";
  if (r.type === "consumption") return "Use / sale";
  return r.type || "Use / sale";
}

function toRows(report: MonthlyStaffReport): { staffName: string; sub: string; rows: TableRow[] }[] {
  return report.staff.map((s) => {
    const rows: TableRow[] = [];
    for (const r of s.receives) {
      rows.push({
        date: r.date,
        product: r.product_name,
        category: r.category || "",
        qty: fmtQty(r.qty),
        location: lineLocation(r),
        type: typeLabel("receive", r),
        note: r.note || "",
      });
    }
    for (const t of s.transfers_from_main) {
      rows.push({
        date: t.date,
        product: t.product_name,
        category: t.category || "",
        qty: fmtQty(t.qty),
        location: lineLocation(t),
        type: typeLabel("transfer", t),
        note: t.note || "",
      });
    }
    for (const c of s.consumptions) {
      rows.push({
        date: c.date,
        product: c.product_name,
        category: c.category || "",
        qty: fmtQty(c.qty),
        location: lineLocation(c),
        type: typeLabel("consumption", c),
        note: c.note || "",
      });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const sub =
      (s.username ? `@${s.username}  ·  ` : "") +
      `+${s.totals.receive_count}/${fmtQty(s.totals.receive_qty_sum)}  <->${s.totals.transfer_count}/${fmtQty(s.totals.transfer_qty_sum)}  -${s.totals.consumption_count}/${fmtQty(s.totals.consumption_qty_sum)}`;
    return { staffName: s.display_name, sub, rows };
  });
}

/** Build a multi-page landscape staff stock report PDF (table layout). */
export async function reportToPdf(
  report: MonthlyStaffReport
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = A4_LANDSCAPE.width;
  const pageHeight = A4_LANDSCAPE.height;
  const marginX = 28;
  const marginTop = 18;
  const footerH = 22;
  const bottomLimit = footerH + 10;
  const contentRight = pageWidth - marginX;
  const contentWidth = contentRight - marginX;

  // Column layout (landscape)
  const cols = {
    date: { x: marginX + 4, w: 88 },
    product: { x: marginX + 94, w: 170 },
    category: { x: marginX + 266, w: 90 },
    qty: { x: marginX + 358, w: 40 },
    location: { x: marginX + 400, w: 110 },
    type: { x: marginX + 512, w: 100 },
    note: { x: marginX + 614, w: contentWidth - 614 + marginX - 4 },
  };
  const tableHeaderH = 18;
  const rowH = 14;
  const fontSize = 8;

  let page: PDFPage = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - marginTop;
  let pageNum = 1;
  const pages: PDFPage[] = [page];

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

  const drawFooter = (p: PDFPage, num: number) => {
    p.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: footerH,
      color: PURPLE_DARK,
    });
    const left = toWinAnsi(
      `Confidential clinic inventory · Staff stock · ${report.range_label}`
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

  const newPage = (withTableHeader = false) => {
    drawFooter(page, pageNum);
    page = doc.addPage([pageWidth, pageHeight]);
    pages.push(page);
    pageNum += 1;
    y = pageHeight - marginTop;
    // thin continuation top bar
    page.drawRectangle({
      x: 0,
      y: pageHeight - 16,
      width: pageWidth,
      height: 16,
      color: PURPLE_DARK,
    });
    drawTextAt(
      `STAFF STOCK REPORT (TABLE) · ${report.range_label} (cont.)`,
      marginX,
      pageHeight - 12,
      7,
      true,
      WHITE
    );
    y = pageHeight - 28;
    if (withTableHeader) drawTableHeader();
  };

  const ensureSpace = (needed: number, withTableHeader = false) => {
    if (y - needed < bottomLimit) {
      newPage(withTableHeader);
    }
  };

  const drawTableHeader = () => {
    ensureSpace(tableHeaderH + 4, false);
    page.drawRectangle({
      x: marginX,
      y: y - tableHeaderH + 4,
      width: contentWidth,
      height: tableHeaderH,
      color: PURPLE,
    });
    const hy = y - 8;
    const headers: [keyof typeof cols, string][] = [
      ["date", "DATE"],
      ["product", "PRODUCT"],
      ["category", "CATEGORY"],
      ["qty", "QTY"],
      ["location", "LOCATION"],
      ["type", "TYPE"],
      ["note", "NOTE"],
    ];
    for (const [key, label] of headers) {
      drawTextAt(label, cols[key].x, hy, 7, true, WHITE, cols[key].w - 2);
    }
    y -= tableHeaderH + 2;
  };

  const drawDataRow = (row: TableRow, zebra: boolean) => {
    ensureSpace(rowH + 2, true);
    if (zebra) {
      page.drawRectangle({
        x: marginX,
        y: y - 3,
        width: contentWidth,
        height: rowH,
        color: ZEBRA,
      });
    }
    const ty = y;
    drawTextAt(row.date, cols.date.x, ty, fontSize, false, TEXT, cols.date.w - 2);
    drawTextAt(row.product, cols.product.x, ty, fontSize, false, TEXT, cols.product.w - 2);
    drawTextAt(row.category, cols.category.x, ty, fontSize, false, TEXT, cols.category.w - 2);
    // qty right-ish
    const qtySafe = toWinAnsi(row.qty);
    const qtyW = font.widthOfTextAtSize(qtySafe, fontSize);
    page.drawText(qtySafe, {
      x: cols.qty.x + cols.qty.w - qtyW - 4,
      y: ty,
      size: fontSize,
      font,
      color: TEXT,
    });
    drawTextAt(row.location, cols.location.x, ty, fontSize, false, TEXT, cols.location.w - 2);
    drawTextAt(row.type, cols.type.x, ty, fontSize, false, TEXT, cols.type.w - 2);
    drawTextAt(row.note, cols.note.x, ty, fontSize, false, MUTED, cols.note.w - 2);
    // thin separator
    page.drawLine({
      start: { x: marginX, y: y - 4 },
      end: { x: contentRight, y: y - 4 },
      thickness: 0.3,
      color: ROW_LINE,
    });
    y -= rowH;
  };

  // --- Page chrome: top bar + banner + KPIs (first page) ---
  page.drawRectangle({
    x: 0,
    y: pageHeight - 18,
    width: pageWidth,
    height: 18,
    color: PURPLE_DARK,
  });
  drawTextAt(
    `STAFF STOCK REPORT (TABLE) · ${report.range_label}`,
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
  drawTextAt(
    `CONSUMPTION & STAFF ACTIVITY · ${report.range_label}`,
    marginX,
    y - 18,
    12,
    true,
    WHITE
  );
  y -= 36;

  // KPI strip — defensive zeros if grand_totals missing
  const ZERO_TOTALS = {
    staff_count: 0,
    receive_qty_sum: 0,
    receive_count: 0,
    transfer_qty_sum: 0,
    transfer_count: 0,
    consumption_qty_sum: 0,
    consumption_count: 0,
  };
  const g = { ...ZERO_TOTALS, ...(report.grand_totals ?? {}) };
  const kpis: { value: string; label: string }[] = [
    { value: String(g.staff_count), label: "STAFF" },
    {
      value: `${fmtQty(g.receive_qty_sum)} (${g.receive_count})`,
      label: "STOCK ADDED",
    },
    {
      value: `${fmtQty(g.transfer_qty_sum)} (${g.transfer_count})`,
      label: "FROM MAIN",
    },
    {
      value: `${fmtQty(g.consumption_qty_sum)} (${g.consumption_count})`,
      label: "USE / SALE",
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
    const val = toWinAnsi(k.value);
    const valSize = 14;
    page.drawText(val, {
      x: x + 10,
      y: y - 20,
      size: valSize,
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
  y -= cardH + 10;

  if (report.staff.length === 0) {
    drawTextAt(
      "No stock additions, transfers from Main Store, or use/sale for this range.",
      marginX,
      y,
      10
    );
    drawFooter(page, pageNum);
    return doc.save();
  }

  const groups = toRows(report);
  for (const group of groups) {
    ensureSpace(tableHeaderH + rowH * 2 + 28, false);
    drawTextAt(group.staffName, marginX, y, 11, true, PURPLE);
    y -= 12;
    drawTextAt(group.sub, marginX, y, 8, false, MUTED);
    y -= 14;
    drawTableHeader();
    group.rows.forEach((row, i) => drawDataRow(row, i % 2 === 1));
    y -= 10;
  }

  drawFooter(page, pageNum);
  return doc.save();
}
