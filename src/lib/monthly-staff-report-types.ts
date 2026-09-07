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
  year: number;
  month: number;
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
