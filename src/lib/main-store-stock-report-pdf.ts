/**
 * 9-page purple landscape Main Store Stock Report (pdf-lib, Vercel-safe).
 * Charts drawn with primitives (bars + legend donut panels) — no native canvas.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { toWinAnsi } from "./monthly-staff-report-pdf";
import {
  A4_LANDSCAPE,
  MUTED,
  PURPLE,
  PURPLE_DARK,
  ROW_LINE,
  TEXT,
  USED_RED,
  WHITE,
  ZEBRA,
} from "./report-theme";
import {
  fmtQty,
  type MainStoreReport,
  type MainStoreSku,
} from "./main-store-stock-report";

const PAGE_W = A4_LANDSCAPE.width;
const PAGE_H = A4_LANDSCAPE.height;
const MX = 28;
const HEADER_H = 28;
const FOOTER_H = 24;
const GREEN = rgb(0.08, 0.5, 0.24);
const RED = rgb(0.75, 0.0, 0.0);
const ORANGE = rgb(0.92, 0.35, 0.05);
const AMBER = rgb(0.85, 0.47, 0.02);
const GREY = rgb(0.4, 0.45, 0.5);
const PURPLE_SOFT = rgb(0.93, 0.89, 0.96);
const RED_SOFT = rgb(0.99, 0.89, 0.89);
const AMBER_SOFT = rgb(0.99, 0.95, 0.78);

type Ctx = {
  doc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  report: MainStoreReport;
  page: PDFPage;
  pageNum: number;
};

function safe(s: string) {
  return toWinAnsi(s || "");
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-AE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmtPrice(n: number): string {
  if (!n) return "—";
  return n.toLocaleString("en-AE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function drawHeaderFooter(ctx: Ctx) {
  const { page, font, fontBold, report, pageNum } = ctx;
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: PURPLE });
  page.drawText(safe("MAIN STORE STOCK REPORT · SEPTEMBER 2026"), {
    x: MX, y: PAGE_H - 18, size: 9, font: fontBold, color: WHITE,
  });
  const dateW = font.widthOfTextAtSize(safe(report.snapshot_label), 9);
  page.drawText(safe(report.snapshot_label), {
    x: PAGE_W - MX - dateW, y: PAGE_H - 18, size: 9, font, color: WHITE,
  });
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: FOOTER_H, color: PURPLE });
  const foot = `Confidential clinic inventory · ${report.snapshot_date} snapshot vs ${report.prev_date} count`;
  page.drawText(safe(foot), { x: MX, y: 9, size: 7, font, color: WHITE });
  const pn = `Page ${pageNum}`;
  page.drawText(safe(pn), {
    x: PAGE_W - MX - font.widthOfTextAtSize(safe(pn), 7), y: 9, size: 7, font, color: WHITE,
  });
}

function newPage(ctx: Ctx): PDFPage {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageNum += 1;
  drawHeaderFooter(ctx);
  return ctx.page;
}

function drawText(
  ctx: Ctx, text: string, x: number, y: number, size: number,
  opts: { bold?: boolean; color?: RGB; maxW?: number } = {}
) {
  const f = opts.bold ? ctx.fontBold : ctx.font;
  let s = safe(text);
  if (!s) return;
  if (opts.maxW != null && f.widthOfTextAtSize(s, size) > opts.maxW) {
    while (s.length > 1 && f.widthOfTextAtSize(s + "...", size) > opts.maxW) s = s.slice(0, -1);
    s += "...";
  }
  ctx.page.drawText(s, { x, y, size, font: f, color: opts.color ?? TEXT });
}

function drawBanner(ctx: Ctx, title: string, y: number): number {
  const h = 18;
  ctx.page.drawRectangle({ x: MX, y: y - h + 4, width: PAGE_W - 2 * MX, height: h, color: PURPLE });
  drawText(ctx, title, MX + 8, y - 8, 9, { bold: true, color: WHITE });
  return y - h - 6;
}

function drawKpis(
  ctx: Ctx,
  items: { value: string; label: string; color: RGB; band: RGB }[],
  y: number
): number {
  const n = items.length;
  const gap = 6;
  const w = (PAGE_W - 2 * MX - gap * (n - 1)) / n;
  const h = 48;
  items.forEach((it, i) => {
    const x = MX + i * (w + gap);
    ctx.page.drawRectangle({ x, y: y - h, width: w, height: h, color: rgb(0.98, 0.98, 0.99), borderColor: ROW_LINE, borderWidth: 0.5 });
    ctx.page.drawRectangle({ x, y: y - 4, width: w, height: 4, color: it.band });
    const valueSize = n >= 7 ? 11 : 14;
    const labelSize = n >= 7 ? 5.5 : 6;
    let vs = valueSize;
    let vw = ctx.fontBold.widthOfTextAtSize(safe(it.value), vs);
    while (vs > 8 && vw > w - 6) {
      vs -= 0.5;
      vw = ctx.fontBold.widthOfTextAtSize(safe(it.value), vs);
    }
    drawText(ctx, it.value, x + (w - vw) / 2, y - 24, vs, { bold: true, color: it.color });
    const lw = ctx.font.widthOfTextAtSize(safe(it.label.toUpperCase()), labelSize);
    drawText(ctx, it.label.toUpperCase(), x + Math.max(2, (w - lw) / 2), y - 38, labelSize, { color: MUTED, maxW: w - 4 });
  });
  return y - h - 8;
}

/** Legend-style donut panel with center label. */
function drawDonutPanel(
  ctx: Ctx,
  x: number, yTop: number, w: number, h: number,
  title: string,
  center: string,
  centerSub: string,
  slices: { label: string; value: number; color: RGB }[]
) {
  drawText(ctx, title, x + 4, yTop - 10, 8, { bold: true, color: PURPLE });
  const cx = x + w * 0.32;
  const cy = yTop - h * 0.55;
  const R = Math.min(w * 0.22, h * 0.32);
  const total = slices.reduce((s, sl) => s + Math.max(0, sl.value), 0) || 1;
  // ring background
  ctx.page.drawCircle({ x: cx, y: cy, size: R, color: rgb(0.92, 0.92, 0.94) });
  // approximate segments as stacked legend + colored arc markers via small circles on ring
  let angle = -Math.PI / 2;
  slices.forEach((sl) => {
    const frac = Math.max(0, sl.value) / total;
    const steps = Math.max(2, Math.round(frac * 24));
    for (let i = 0; i < steps; i++) {
      const a = angle + ((i + 0.5) / steps) * frac * Math.PI * 2;
      const px = cx + Math.cos(a) * (R * 0.78);
      const py = cy + Math.sin(a) * (R * 0.78);
      ctx.page.drawCircle({ x: px, y: py, size: R * 0.18, color: sl.color });
    }
    angle += frac * Math.PI * 2;
  });
  ctx.page.drawCircle({ x: cx, y: cy, size: R * 0.55, color: WHITE });
  const cw = ctx.fontBold.widthOfTextAtSize(safe(center), 10);
  drawText(ctx, center, cx - cw / 2, cy + 4, 10, { bold: true });
  const sw = ctx.font.widthOfTextAtSize(safe(centerSub), 7);
  drawText(ctx, centerSub, cx - sw / 2, cy - 10, 7, { color: MUTED });
  // legend
  let ly = yTop - 28;
  const lx = x + w * 0.55;
  slices.forEach((sl) => {
    ctx.page.drawRectangle({ x: lx, y: ly - 2, width: 8, height: 8, color: sl.color });
    drawText(ctx, `${sl.label} (${fmtQty(sl.value)})`, lx + 12, ly, 7, { maxW: w * 0.42 });
    ly -= 12;
  });
}

function drawHBarChart(
  ctx: Ctx,
  x: number, yTop: number, w: number, h: number,
  title: string,
  items: { label: string; value: number; color?: RGB }[]
) {
  drawText(ctx, title, x + 2, yTop - 10, 8, { bold: true, color: PURPLE });
  const maxV = Math.max(...items.map((i) => i.value), 1);
  const rowH = Math.min(16, (h - 24) / Math.max(items.length, 1));
  items.forEach((it, i) => {
    const y = yTop - 28 - i * rowH;
    drawText(ctx, it.label, x + 2, y, 6.5, { maxW: w * 0.38, color: TEXT });
    const barX = x + w * 0.4;
    const barW = (w * 0.48) * (it.value / maxV);
    ctx.page.drawRectangle({
      x: barX, y: y - 2, width: Math.max(barW, 1), height: rowH * 0.55,
      color: it.color ?? PURPLE,
    });
    drawText(ctx, fmtQty(it.value), barX + barW + 4, y, 6.5, { color: MUTED });
  });
}

function whereDrawn(r: MainStoreSku): string {
  const bits: string[] = [];
  const pairs: [string, number, number][] = [
    ["Main", r.prev_main, r.main],
    ["Ahmad", r.prev_ahmad, r.ahmad],
    ["Saly", r.prev_saly, r.saly],
    ["Niveen", r.prev_niveen, r.niveen],
    ["Sassani", r.prev_sassani, r.sassani],
  ];
  for (const [lab, prev, now] of pairs) {
    const d = now - prev;
    if (Math.abs(d) < 1e-9) continue;
    bits.push(`${lab} ${d > 0 ? "+" : ""}${fmtQty(d)}`);
  }
  return bits.join(", ") || "—";
}

function priorityActions(report: MainStoreReport): { flag: string; text: string; bg: RGB; fg: RGB }[] {
  const out: { flag: string; text: string; bg: RGB; fg: RGB }[] = [];
  const usedTop = [...report.rows].filter((r) => !r.is_transducer && r.used > 0).sort((a, b) => b.used - a.used);
  for (const r of report.rows) {
    if (r.status === "Expires this month" && r.total > 0) {
      out.push({
        flag: "CRITICAL", text: `${r.product} — ${fmtQty(r.total)} units expire ${r.expiry}. Use or write off before month-end.`,
        bg: RED_SOFT, fg: RED,
      });
    }
  }
  for (const r of usedTop) {
    if (r.total === 0 && r.used > 0) {
      out.push({
        flag: "USED", text: `${r.product} (${r.expiry}) went ${fmtQty(r.prev_total)} → 0 — ${fmtQty(r.used)} used/cleared.`,
        bg: PURPLE_SOFT, fg: PURPLE,
      });
      break;
    }
  }
  for (const r of report.rows) {
    if (r.status === "Expiring ≤90 days" && r.total > 0) {
      out.push({
        flag: "SOON", text: `${r.product} ${fmtQty(r.total)} units expire ${r.expiry}.`,
        bg: AMBER_SOFT, fg: ORANGE,
      });
    }
  }
  for (const r of report.rows) {
    if (r.is_transducer && r.product.includes("7-3.0")) {
      out.push({
        flag: "SOON", text: `${r.product} — ${fmtQty(r.total)} lines expire ${r.expiry}. Plan usage or replacement.`,
        bg: AMBER_SOFT, fg: ORANGE,
      });
    }
  }
  if (usedTop.length) {
    const bits = usedTop.slice(0, 6).map((r) => `${r.product.split("(")[0].trim()} −${fmtQty(r.used)}`).join(", ");
    out.push({ flag: "USED", text: `Biggest draws: ${bits}.`, bg: PURPLE_SOFT, fg: PURPLE });
  }
  const hold = [...report.rows].filter((r) => !r.is_transducer).sort((a, b) => b.total - a.total);
  if (hold.length >= 2) {
    out.push({
      flag: "HOLDING",
      text: `${hold[0].product} ${fmtQty(hold[0].total)} and ${hold[1].product} ${fmtQty(hold[1].total)} are the largest injectable holdings.`,
      bg: ZEBRA, fg: GREY,
    });
  }
  if (report.new_skus.length) {
    out.push({
      flag: "RECV", text: `New SKUs: ${report.new_skus.join(", ")}.`,
      bg: rgb(0.86, 0.95, 0.88), fg: GREEN,
    });
  }
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = a.flag + a.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 10);
}

export async function mainStoreReportToPdf(report: MainStoreReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Main Store Stock Report — September 2026");
  doc.setAuthor("Clinic inventory");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, fontBold, report, page: null as unknown as PDFPage, pageNum: 0 };
  newPage(ctx);

  const nonT = report.rows.filter((r) => !r.is_transducer);
  const expired_n = report.rows.filter((r) => r.status === "Expired").length;
  const this_mo = report.rows.filter((r) => r.status === "Expires this month").length;
  const d90 = report.rows.filter((r) => r.status === "Expiring ≤90 days").length;

  // ===== PAGE 1 =====
  drawText(ctx, "MAIN STORE STOCK REPORT", MX, PAGE_H - HEADER_H - 22, 16, { bold: true, color: PURPLE });
  drawText(
    ctx,
    `September 2026 snapshot · ${report.snapshot_label} · Main Store + doctors · compared with ${report.prev_label}`,
    MX, PAGE_H - HEADER_H - 36, 7.5, { color: MUTED, maxW: PAGE_W - 2 * MX }
  );
  let y = drawKpis(ctx, [
    { value: String(report.sku_n), label: "SKU lines", color: PURPLE, band: rgb(0.77, 0.71, 0.99) },
    { value: String(report.in_stock), label: "In stock", color: GREEN, band: rgb(0.53, 0.94, 0.67) },
    { value: String(report.oos), label: "Out of stock", color: GREY, band: rgb(0.8, 0.84, 0.88) },
    { value: String(expired_n), label: "Expired", color: RED, band: rgb(0.99, 0.65, 0.65) },
    { value: String(this_mo), label: "Expires this month", color: rgb(0.88, 0.11, 0.28), band: rgb(0.99, 0.8, 0.83) },
    { value: String(d90), label: "Expiring ≤90 days", color: AMBER, band: rgb(0.99, 0.91, 0.54) },
    { value: fmtMoney(report.total_value), label: "Total value (AED)", color: GREEN, band: rgb(0.53, 0.94, 0.67) },
  ], PAGE_H - HEADER_H - 48);

  const locVals = [
    { label: "Main Store", value: nonT.reduce((s, r) => s + r.main, 0), color: PURPLE },
    { label: "Dr. Saly", value: nonT.reduce((s, r) => s + r.saly, 0), color: ORANGE },
    { label: "Dr. Ahmad", value: nonT.reduce((s, r) => s + r.ahmad, 0), color: rgb(0.23, 0.51, 0.96) },
    { label: "Dr. Niveen", value: nonT.reduce((s, r) => s + r.niveen, 0), color: rgb(0.22, 0.74, 0.97) },
    { label: "Dr. Sassani", value: nonT.reduce((s, r) => s + r.sassani, 0), color: rgb(0.93, 0.28, 0.6) },
  ];
  const panelW = (PAGE_W - 2 * MX - 12) / 2;
  const panelH = 155;
  drawDonutPanel(ctx, MX, y, panelW, panelH, "Product units by location", fmtQty(report.units_now), "units", locVals);
  drawDonutPanel(ctx, MX + panelW + 12, y, panelW, panelH, "SKU lines — stock status", String(report.sku_n), "SKUs", [
    { label: "In stock", value: report.in_stock, color: GREEN },
    { label: "Out of stock", value: report.oos, color: GREY },
  ]);
  y -= panelH + 8;
  const dated = report.rows.filter((r) => r.status !== "No date");
  const order = ["Normal", "Expiring ≤6 months", "Expiring ≤90 days", "Expired", "Expires this month"] as const;
  const ecol: Record<string, RGB> = {
    Normal: GREEN,
    "Expiring ≤6 months": rgb(0.92, 0.7, 0.03),
    "Expiring ≤90 days": ORANGE,
    Expired: RED,
    "Expires this month": rgb(0.88, 0.11, 0.28),
  };
  drawDonutPanel(ctx, MX, y, panelW, panelH, "Dated SKUs — expiry profile", String(dated.length), "dated SKUs",
    order.map((s) => ({ label: s, value: dated.filter((r) => r.status === s).length, color: ecol[s] })));
  const docVals = locVals.slice(1);
  drawDonutPanel(ctx, MX + panelW + 12, y, panelW, panelH, "Units held in doctor rooms",
    fmtQty(docVals.reduce((s, v) => s + v.value, 0)), "with doctors", docVals);

  // ===== PAGE 2 =====
  newPage(ctx);
  y = drawBanner(ctx, `CONSUMPTION & SALES SUMMARY · ${report.prev_date} → ${report.snapshot_date}`, PAGE_H - HEADER_H - 14);
  const net = report.units_now - report.units_prev;
  const usedSkus = nonT.filter((r) => r.used > 0).length;
  y = drawKpis(ctx, [
    { value: fmtQty(report.units_prev), label: `Units ${report.prev_date}`, color: PURPLE, band: rgb(0.77, 0.71, 0.99) },
    { value: fmtQty(report.units_now), label: `Units ${report.snapshot_date}`, color: GREEN, band: rgb(0.53, 0.94, 0.67) },
    { value: fmtQty(report.used_total), label: "Consumed / used", color: RED, band: rgb(0.99, 0.65, 0.65) },
    { value: fmtQty(report.receipt_total), label: "Receipts / adds", color: GREEN, band: rgb(0.53, 0.94, 0.67) },
    { value: `${net >= 0 ? "+" : ""}${fmtQty(net)}`, label: "Net change", color: ORANGE, band: rgb(0.99, 0.73, 0.45) },
    { value: String(usedSkus), label: "SKUs with usage", color: GREY, band: rgb(0.8, 0.84, 0.88) },
  ], y);
  drawText(ctx, "Movement inferred from previous snapshot vs today. Ulthera transducers excluded from unit totals. Status is Normal (never OK).",
    MX, y, 6.5, { color: MUTED, maxW: PAGE_W - 2 * MX });
  y -= 14;
  const usedTop = [...nonT].filter((r) => r.used > 0).sort((a, b) => b.used - a.used);
  drawHBarChart(ctx, MX, y, panelW, 170, "Largest quantity drops (units used)",
    usedTop.slice(0, 10).map((r) => ({ label: r.product.slice(0, 36), value: r.used, color: RED })));
  const umix = new Map<string, number>();
  for (const r of usedTop) umix.set(r.category_long, (umix.get(r.category_long) || 0) + r.used);
  const umItems = [...umix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  drawDonutPanel(ctx, MX + panelW + 12, y, panelW, 170, "Usage mix by category",
    fmtQty(report.used_total), "units used",
    umItems.map((([label, value], i) => ({
      label: label.slice(0, 28), value,
      color: [PURPLE, rgb(0.49, 0.23, 0.93), rgb(0.23, 0.51, 0.96), ORANGE, GREEN, GREY, rgb(0.93, 0.28, 0.6), AMBER][i % 8],
    }))));
  y -= 180;
  // movement table
  const cols = [
    { k: "product", w: 150, label: "PRODUCT" },
    { k: "cat", w: 140, label: "CATEGORY" },
    { k: "prev", w: 50, label: "PREV" },
    { k: "now", w: 50, label: "NOW" },
    { k: "used", w: 45, label: "USED" },
    { k: "where", w: PAGE_W - 2 * MX - 435, label: "WHERE DRAWN" },
  ];
  let x = MX;
  ctx.page.drawRectangle({ x: MX, y: y - 12, width: PAGE_W - 2 * MX, height: 14, color: PURPLE });
  cols.forEach((c) => {
    drawText(ctx, c.label, x + 2, y - 8, 7, { bold: true, color: WHITE });
    x += c.w;
  });
  y -= 16;
  for (let i = 0; i < Math.min(12, usedTop.length); i++) {
    const r = usedTop[i];
    if (y < FOOTER_H + 40) break;
    if (i % 2 === 1) ctx.page.drawRectangle({ x: MX, y: y - 3, width: PAGE_W - 2 * MX, height: 12, color: PURPLE_SOFT });
    x = MX;
    const vals = [r.product, r.category_long, fmtQty(r.prev_total), fmtQty(r.total), fmtQty(r.used), whereDrawn(r)];
    vals.forEach((v, j) => {
      drawText(ctx, v, x + 2, y, 6.5, {
        bold: j === 4, color: j === 4 ? RED : TEXT, maxW: cols[j].w - 4,
      });
      x += cols[j].w;
    });
    y -= 12;
  }

  // ===== PAGE 3 =====
  newPage(ctx);
  y = drawBanner(ctx, "HOLDINGS & LOCATION MIX", PAGE_H - HEADER_H - 14);
  const catUnits = new Map<string, { units: number; main: number; doc: number }>();
  for (const r of nonT) {
    const c = r.category_long;
    const cur = catUnits.get(c) || { units: 0, main: 0, doc: 0 };
    cur.units += r.total; cur.main += r.main; cur.doc += r.ahmad + r.saly + r.niveen + r.sassani;
    catUnits.set(c, cur);
  }
  const topCats = [...catUnits.entries()].sort((a, b) => b[1].units - a[1].units).slice(0, 10);
  drawHBarChart(ctx, MX, y, panelW, 175, "Top 10 categories by reported units",
    topCats.map(([label, v]) => ({ label: label.slice(0, 34), value: v.units })));
  // main vs doc as paired bars — show main values
  drawHBarChart(ctx, MX + panelW + 12, y, panelW, 175, "Main Store vs doctor rooms — top categories (Main)",
    topCats.map(([label, v]) => ({ label: label.slice(0, 34), value: v.main, color: PURPLE })));
  y -= 185;
  const hold = [...nonT].sort((a, b) => b.total - a.total).slice(0, 12);
  drawHBarChart(ctx, MX, y, panelW, 175, "Largest product holdings (excl. transducers)",
    hold.map((r) => ({ label: r.product.slice(0, 36), value: r.total })));
  const risk = report.rows
    .filter((r) => ["Expired", "Expires this month", "Expiring ≤90 days"].includes(r.status) && r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  drawHBarChart(ctx, MX + panelW + 12, y, panelW, 175, "Expiry watchlist — units at risk",
    risk.map((r) => ({
      label: r.product.slice(0, 36), value: r.total,
      color: r.status === "Expired" ? rgb(0.6, 0.1, 0.1) : r.status === "Expires this month" ? RED : ORANGE,
    })));

  // ===== PAGE 4 =====
  newPage(ctx);
  y = drawBanner(ctx, "PRIORITY ACTIONS", PAGE_H - HEADER_H - 14);
  const acts = priorityActions(report);
  ctx.page.drawRectangle({ x: MX, y: y - 12, width: PAGE_W - 2 * MX, height: 14, color: PURPLE });
  drawText(ctx, "FLAG", MX + 4, y - 8, 7, { bold: true, color: WHITE });
  drawText(ctx, "ACTION", MX + 70, y - 8, 7, { bold: true, color: WHITE });
  y -= 16;
  for (const a of acts) {
    if (y < FOOTER_H + 120) break;
    ctx.page.drawRectangle({ x: MX, y: y - 4, width: 60, height: 14, color: a.bg });
    drawText(ctx, a.flag, MX + 4, y, 7, { bold: true, color: a.fg });
    drawText(ctx, a.text, MX + 70, y, 7, { maxW: PAGE_W - MX - 80, color: TEXT });
    y -= 16;
  }
  y -= 6;
  y = drawBanner(ctx, "EXPIRY WATCHLIST — dated items expired or due within 90 days", y);
  const riskAll = report.rows
    .filter((r) => ["Expired", "Expires this month", "Expiring ≤90 days"].includes(r.status))
    .sort((a, b) => {
      const rank: Record<string, number> = { Expired: 0, "Expires this month": 1, "Expiring ≤90 days": 2 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.total - a.total;
    })
    .slice(0, 14);
  const wcols = [90, 130, 40, 80, 35, 35, 35, 35, 40, 40];
  const wlabels = ["CATEGORY", "PRODUCT", "EXPIRY", "STATUS", "TOTAL", "MAIN", "AHMAD", "SALY", "NIVEEN", "SASSANI"];
  x = MX;
  ctx.page.drawRectangle({ x: MX, y: y - 12, width: PAGE_W - 2 * MX, height: 14, color: PURPLE });
  wlabels.forEach((lab, i) => {
    drawText(ctx, lab, x + 1, y - 8, 6, { bold: true, color: WHITE });
    x += wcols[i];
  });
  y -= 14;
  for (let i = 0; i < riskAll.length; i++) {
    const r = riskAll[i];
    if (y < FOOTER_H + 30) break;
    const bg = r.status === "Expiring ≤90 days" ? AMBER_SOFT : RED_SOFT;
    ctx.page.drawRectangle({ x: MX, y: y - 3, width: PAGE_W - 2 * MX, height: 11, color: bg });
    const vals = [r.category_long, r.product, r.expiry, r.status, fmtQty(r.total), fmtQty(r.main), fmtQty(r.ahmad), fmtQty(r.saly), fmtQty(r.niveen), fmtQty(r.sassani)];
    x = MX;
    vals.forEach((v, j) => {
      drawText(ctx, v, x + 1, y, 6, {
        bold: j === 3, color: j === 3 && r.status !== "Expiring ≤90 days" ? RED : j === 3 ? ORANGE : TEXT,
        maxW: wcols[j] - 2,
      });
      x += wcols[j];
    });
    y -= 11;
  }

  // ===== PAGE 5 =====
  newPage(ctx);
  y = drawBanner(ctx, "STOCK BY LOCATION (product units, excluding transducer lines)", PAGE_H - HEADER_H - 14);
  const locs = [
    { name: "Main Store", now: nonT.reduce((s, r) => s + r.main, 0), prev: nonT.reduce((s, r) => s + r.prev_main, 0) },
    { name: "Dr. Ahmad", now: nonT.reduce((s, r) => s + r.ahmad, 0), prev: nonT.reduce((s, r) => s + r.prev_ahmad, 0) },
    { name: "Dr. Saly", now: nonT.reduce((s, r) => s + r.saly, 0), prev: nonT.reduce((s, r) => s + r.prev_saly, 0) },
    { name: "Dr. Niveen", now: nonT.reduce((s, r) => s + r.niveen, 0), prev: nonT.reduce((s, r) => s + r.prev_niveen, 0) },
    { name: "Dr. Sassani", now: nonT.reduce((s, r) => s + r.sassani, 0), prev: nonT.reduce((s, r) => s + r.prev_sassani, 0) },
  ];
  const lheaders = ["LOCATION", "UNITS NOW", "% OF TOTAL", "UNITS PREV", "CHANGE"];
  const lw = [160, 100, 100, 100, 100];
  x = MX;
  ctx.page.drawRectangle({ x: MX, y: y - 12, width: PAGE_W - 2 * MX, height: 14, color: PURPLE });
  lheaders.forEach((h, i) => { drawText(ctx, h, x + 4, y - 8, 7, { bold: true, color: WHITE }); x += lw[i]; });
  y -= 16;
  for (const loc of locs) {
    const ch = loc.now - loc.prev;
    const pct = report.units_now ? (loc.now / report.units_now) * 100 : 0;
    const vals = [loc.name, fmtQty(loc.now), `${pct.toFixed(1)}%`, fmtQty(loc.prev), `${ch > 0 ? "+" : ""}${fmtQty(ch)}`];
    x = MX;
    vals.forEach((v, j) => {
      drawText(ctx, v, x + 4, y, 7.5, { color: j === 4 && ch < 0 ? RED : j === 4 && ch > 0 ? GREEN : TEXT });
      x += lw[j];
    });
    y -= 14;
  }
  ctx.page.drawRectangle({ x: MX, y: y - 3, width: PAGE_W - 2 * MX, height: 14, color: PURPLE_SOFT });
  const chAll = report.units_now - report.units_prev;
  x = MX;
  [`All locations`, fmtQty(report.units_now), "100.0%", fmtQty(report.units_prev), `${chAll >= 0 ? "+" : ""}${fmtQty(chAll)}`].forEach((v, j) => {
    drawText(ctx, v, x + 4, y, 7.5, { bold: true }); x += lw[j];
  });
  y -= 28;
  y = drawBanner(ctx, "STOCK BY CATEGORY", y);
  const catOrder: string[] = [];
  const seenC = new Set<string>();
  for (const r of report.rows) {
    if (!seenC.has(r.category_long)) { seenC.add(r.category_long); catOrder.push(r.category_long); }
  }
  const cheaders = ["CATEGORY", "SKUs", "IN", "OOS", "UNITS", "MAIN", "DOCTORS", "USED"];
  const cw = [220, 40, 35, 35, 55, 55, 55, 50];
  x = MX;
  ctx.page.drawRectangle({ x: MX, y: y - 11, width: PAGE_W - 2 * MX, height: 13, color: PURPLE });
  cheaders.forEach((h, i) => { drawText(ctx, h, x + 2, y - 8, 6.5, { bold: true, color: WHITE }); x += cw[i]; });
  y -= 13;
  for (const c of catOrder) {
    if (y < FOOTER_H + 36) break;
    const grp = report.rows.filter((r) => r.category_long === c);
    const sk = grp.length;
    const ins = grp.filter((r) => r.total > 0).length;
    const units = grp.reduce((s, r) => s + r.total, 0);
    const main = grp.reduce((s, r) => s + r.main, 0);
    const doc = grp.reduce((s, r) => s + r.ahmad + r.saly + r.niveen + r.sassani, 0);
    const used = grp.reduce((s, r) => s + r.used, 0);
    const vals = [c, String(sk), String(ins), String(sk - ins), fmtQty(units), fmtQty(main), fmtQty(doc), used > 0 ? fmtQty(used) : "—"];
    x = MX;
    vals.forEach((v, j) => {
      drawText(ctx, v, x + 2, y, 6, { color: j === 7 && used > 0 ? RED : TEXT, maxW: cw[j] - 3 });
      x += cw[j];
    });
    y -= 10;
  }
  ctx.page.drawRectangle({ x: MX, y: y - 2, width: PAGE_W - 2 * MX, height: 12, color: PURPLE_SOFT });
  x = MX;
  ["ALL (excl. transducers)", String(report.sku_n), String(report.in_stock), String(report.oos),
    fmtQty(report.units_now), fmtQty(locs[0].now), fmtQty(locs.slice(1).reduce((s, l) => s + l.now, 0)),
    fmtQty(report.used_total)].forEach((v, j) => {
    drawText(ctx, v, x + 2, y, 6.5, { bold: true, maxW: cw[j] - 3 }); x += cw[j];
  });

  // ===== PAGES 6-9 INVENTORY =====
  const inv = report.rows;
  const perPage = Math.ceil(inv.length / 4);
  for (let p = 0; p < 4; p++) {
    newPage(ctx);
    const title = p === 0
      ? `FULL INVENTORY · injectables through threads · ${report.sku_n} SKU lines`
      : "FULL INVENTORY · continued";
    y = drawBanner(ctx, title, PAGE_H - HEADER_H - 14);
    // Category | Product | Expiry | Status | Total | Price | Value | Main | Ahmad | Saly | Niveen | Sassani
    const icols = [78, 148, 34, 68, 30, 40, 48, 32, 32, 32, 34, 36];
    const ilabels = ["CATEGORY", "PRODUCT", "EXPIRY", "STATUS", "TOTAL", "PRICE", "VALUE", "MAIN", "AHMAD", "SALY", "NIVEEN", "SASSANI"];
    x = MX;
    ctx.page.drawRectangle({ x: MX, y: y - 11, width: PAGE_W - 2 * MX, height: 13, color: PURPLE });
    ilabels.forEach((lab, i) => { drawText(ctx, lab, x + 1, y - 8, 5.5, { bold: true, color: WHITE }); x += icols[i]; });
    y -= 12;
    const chunk = inv.slice(p * perPage, (p + 1) * perPage);
    for (let i = 0; i < chunk.length; i++) {
      const r = chunk[i];
      if (y < FOOTER_H + 28) break;
      const bg = r.total <= 0 ? ZEBRA
        : r.status === "Expired" || r.status === "Expires this month" ? RED_SOFT
        : r.status === "Expiring ≤90 days" ? AMBER_SOFT
        : i % 2 === 1 ? PURPLE_SOFT : WHITE;
      if (bg !== WHITE) ctx.page.drawRectangle({ x: MX, y: y - 2, width: PAGE_W - 2 * MX, height: 10, color: bg });
      const vals = [
        r.category, r.product, r.expiry, r.status, fmtQty(r.total),
        fmtPrice(r.unit_price), r.unit_price ? fmtMoney(r.total_value) : (r.total_value ? fmtMoney(r.total_value) : "—"),
        fmtQty(r.main), fmtQty(r.ahmad), fmtQty(r.saly), fmtQty(r.niveen), fmtQty(r.sassani),
      ];
      x = MX;
      vals.forEach((v, j) => {
        drawText(ctx, v, x + 1, y, 5.5, {
          bold: j === 3 && (r.status === "Expired" || r.status === "Expires this month"),
          color: j === 3 && (r.status === "Expired" || r.status === "Expires this month") ? RED : TEXT,
          maxW: icols[j] - 2,
        });
        x += icols[j];
      });
      y -= 10;
    }
    if (p === 3) {
      drawText(ctx, "Blank cells shown as 0. Status uses month-end of printed expiry. Grey = OOS. Status is Normal (never OK).",
        MX, Math.max(y - 8, FOOTER_H + 8), 6, { color: MUTED, maxW: PAGE_W - 2 * MX });
    }
  }

  return doc.save();
}
