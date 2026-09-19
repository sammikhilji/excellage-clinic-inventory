import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { MonthlyStaffReport, ReportLine } from "./monthly-staff-report-types";

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
      .replace(/\u00B7/g, ".") // · (keep printable; WinAnsi has it but normalize for safety)
      // Strip / replace any remaining non-WinAnsi (keep tab/newline, printable ASCII + Latin-1 0xA0-0xFF)
      .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, (ch) => {
        // Try a few more known symbols
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

/** Build a multi-page staff stock report PDF. */
export async function reportToPdf(
  report: MonthlyStaffReport
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const fontSize = 10;
  const titleSize = 14;
  const headingSize = 11;
  const lineHeight = 14;
  const bottomLimit = margin + 20;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < bottomLimit) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
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

  const wrapText = (text: string, maxWidth: number, size: number): string[] => {
    const f = font;
    const safe = toWinAnsi(text);
    const words = safe.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const trial = `${current} ${words[i]}`;
      if (f.widthOfTextAtSize(trial, size) <= maxWidth) {
        current = trial;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
    return lines;
  };

  // Title
  drawText("Clinic Inventory — Staff stock report", margin, titleSize, true);
  y -= lineHeight + 4;
  drawText(`Range: ${report.range_label}`, margin, fontSize);
  y -= lineHeight;
  const g = report.grand_totals;
  drawText(
    `Staff: ${g.staff_count}  ·  Stock added: ${fmtQty(g.receive_qty_sum)} (${g.receive_count})  ·  From Main: ${fmtQty(g.transfer_qty_sum)} (${g.transfer_count})  ·  Use/sale: ${fmtQty(g.consumption_qty_sum)} (${g.consumption_count})`,
    margin,
    9
  );
  y -= lineHeight + 8;

  // Divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.75),
  });
  y -= lineHeight;

  if (report.staff.length === 0) {
    ensureSpace(lineHeight);
    drawText(
      "No stock additions, transfers from Main Store, or use/sale for this range.",
      margin,
      fontSize
    );
    return doc.save();
  }

  const drawSectionHeader = (label: string) => {
    ensureSpace(lineHeight + 4);
    drawText(label, margin, headingSize - 1, true, rgb(0.2, 0.25, 0.4));
    y -= lineHeight;
  };

  const drawLineRow = (parts: string[]) => {
    const text = parts.filter(Boolean).join("  ·  ");
    const lines = wrapText(text, contentWidth, fontSize);
    for (const ln of lines) {
      ensureSpace(lineHeight);
      drawText(ln, margin + 8, fontSize);
      y -= lineHeight;
    }
  };

  const lineLocation = (r: ReportLine): string => {
    if (r.to_location) return `→ ${r.to_location}`;
    return r.location || "";
  };

  for (const s of report.staff) {
    ensureSpace(lineHeight * 4);
    drawText(s.display_name, margin, headingSize, true);
    y -= lineHeight;
    const sub =
      (s.username ? `@${s.username}  ·  ` : "") +
      `+${s.totals.receive_count}/${fmtQty(s.totals.receive_qty_sum)}  ↔${s.totals.transfer_count}/${fmtQty(s.totals.transfer_qty_sum)}  −${s.totals.consumption_count}/${fmtQty(s.totals.consumption_qty_sum)}`;
    drawText(sub, margin, 9, false, rgb(0.35, 0.35, 0.4));
    y -= lineHeight + 2;

    if (s.receives.length > 0) {
      drawSectionHeader("Stock added (receives)");
      for (const r of s.receives) {
        drawLineRow([
          r.date,
          r.product_name,
          `qty ${fmtQty(r.qty)}`,
          lineLocation(r),
          r.note || "",
        ]);
      }
      y -= 4;
    }

    if (s.transfers_from_main.length > 0) {
      drawSectionHeader("Transfers from Main Store");
      for (const t of s.transfers_from_main) {
        drawLineRow([
          t.date,
          t.product_name,
          `qty ${fmtQty(t.qty)}`,
          lineLocation(t),
          t.note || "",
        ]);
      }
      y -= 4;
    }

    if (s.consumptions.length > 0) {
      drawSectionHeader("Consumptions / sales");
      for (const c of s.consumptions) {
        drawLineRow([
          c.date,
          c.product_name,
          `qty ${fmtQty(c.qty)}`,
          lineLocation(c),
          c.type || "",
          c.note || "",
        ]);
      }
      y -= 4;
    }

    y -= 6;
    ensureSpace(8);
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.4,
      color: rgb(0.85, 0.85, 0.88),
    });
    y -= lineHeight;
  }

  return doc.save();
}
