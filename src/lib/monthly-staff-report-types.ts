import type { UserRole } from "./types";

export const REPORT_ALLOWED_ROLES: UserRole[] = [
  "admin",
  "manager",
  "head_nurse",
];

export type ReportLine = {
  date: string;
  product_name: string;
  barcode: string;
  qty: number;
  to_location?: string;
  location?: string;
  type?: string;
  note: string | null;
};

export type StaffReport = {
  username: string | null;
  full_name: string | null;
  display_name: string;
  transfers_from_main: ReportLine[];
  consumptions: ReportLine[];
  totals: {
    transfer_qty_sum: number;
    consumption_qty_sum: number;
    transfer_count: number;
    consumption_count: number;
  };
};

export type MonthlyStaffReport = {
  /** Inclusive start date YYYY-MM-DD */
  from: string;
  /** Inclusive end date YYYY-MM-DD */
  to: string;
  /** Human-readable range for titles/headers */
  range_label: string;
  /** @deprecated kept for older clients; derived from `from` */
  year: number;
  /** @deprecated kept for older clients; derived from `from` */
  month: number;
  /** @deprecated alias of range_label */
  month_label: string;
  staff: StaffReport[];
  grand_totals: {
    transfer_qty_sum: number;
    consumption_qty_sum: number;
    transfer_count: number;
    consumption_count: number;
    staff_count: number;
  };
};
