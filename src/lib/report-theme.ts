/** Shared visual theme for clinic inventory PDF reports (Main Store sample style). */
import { rgb, type RGB } from "pdf-lib";

/** Deep purple ~#482980 */
export const PURPLE: RGB = rgb(72 / 255, 41 / 255, 128 / 255);
/** Slightly darker for top/bottom bars */
export const PURPLE_DARK: RGB = rgb(55 / 255, 30 / 255, 100 / 255);
export const WHITE: RGB = rgb(1, 1, 1);
export const TEXT: RGB = rgb(0.1, 0.1, 0.15);
export const MUTED: RGB = rgb(0.4, 0.4, 0.45);
export const ZEBRA: RGB = rgb(0.96, 0.96, 0.97);
export const ROW_LINE: RGB = rgb(0.88, 0.88, 0.9);
export const USED_RED: RGB = rgb(0.75, 0.12, 0.18);

export const KPI_FILLS: RGB[] = [
  rgb(0.9, 0.86, 0.96), // light purple
  rgb(0.86, 0.95, 0.88), // light green
  rgb(0.96, 0.88, 0.9), // light pink
  rgb(0.86, 0.94, 0.92), // light mint
  rgb(0.98, 0.92, 0.84), // light orange
  rgb(0.92, 0.92, 0.93), // light gray
];

export const KPI_TEXT: RGB[] = [
  rgb(0.28, 0.16, 0.5),
  rgb(0.12, 0.4, 0.22),
  rgb(0.65, 0.15, 0.28),
  rgb(0.1, 0.4, 0.35),
  rgb(0.55, 0.32, 0.08),
  rgb(0.3, 0.3, 0.35),
];

/** A4 landscape points */
export const A4_LANDSCAPE = { width: 841.89, height: 595.28 } as const;
/** A4 portrait points */
export const A4_PORTRAIT = { width: 595.28, height: 841.89 } as const;

export const EXCEL_PURPLE = "482980";
export const EXCEL_ZEBRA = "F5F5F7";
