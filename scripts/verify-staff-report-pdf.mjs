/**
 * Smoke-test: Unicode in report text must not throw once sanitized for WinAnsi.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";

function toWinAnsi(s) {
  if (!s) return "";
  return s
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/\u2194/g, "<->")
    .replace(/\u2022/g, "*")
    .replace(/\u00B7/g, ".")
    .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, (ch) => {
      const map = {
        "\u2248": "~",
        "\u2260": "!=",
        "\u2264": "<=",
        "\u2265": ">=",
        "\u00D7": "x",
        "\u00F7": "/",
      };
      return map[ch] ?? "";
    });
}

async function proveUnsanitizedThrows() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  try {
    page.drawText("arrow → here", { x: 10, y: 700, size: 12, font });
    return false;
  } catch {
    return true;
  }
}

async function buildMockPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  let y = 800;
  const draw = (text, bold = false) => {
    const safe = toWinAnsi(text);
    page.drawText(safe, {
      x: 40,
      y,
      size: 10,
      font: bold ? fontBold : font,
    });
    y -= 14;
  };
  draw("Clinic Inventory — Staff stock report", true);
  draw("Range: 1 Sep 2026 — 19 Sep 2026");
  draw("Francia — Lead", true);
  draw("+1  ↔3  −5");
  draw("2026-09-05 · Gauze — sterile · → Cabinet → Shelf · from Main → ward");
  draw('Note: “smart” quotes and… ellipsis');
  return doc.save();
}

const threw = await proveUnsanitizedThrows();
if (!threw) {
  console.error("FAIL: expected unsanitized → to throw");
  process.exit(1);
}
console.log("OK: unsanitized Unicode throws as expected");

const samples = [
  ["—", "-"],
  ["→", "->"],
  ["↔", "<->"],
  ["−", "-"],
];
for (const [inp, exp] of samples) {
  const out = toWinAnsi(inp);
  if (out !== exp) {
    console.error("FAIL toWinAnsi", inp, "=>", out, "expected", exp);
    process.exit(1);
  }
}
console.log("OK: toWinAnsi replacements");

const bytes = await buildMockPdf();
if (!(bytes instanceof Uint8Array) || bytes.length < 100) {
  console.error("FAIL: pdf too small", bytes?.length);
  process.exit(1);
}
console.log("OK: mock report with — and → built PDF,", bytes.length, "bytes");
