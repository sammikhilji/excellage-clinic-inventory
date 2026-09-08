export const LOCATIONS = [
  "Main Store",
  "Dr. Ahmad",
  "Dr. Saly",
  "Dr. Niveen",
  "Dr. Sassani",
] as const;

/** Dynamic location name; defaults come from LOCATIONS. */
export type Location = string;

/** Preset unit options; products may also store a custom unit string. */
export const UNIT_OPTIONS = [
  "units",
  "syringe",
  "vial",
  "mL",
  "cc",
  "lines",
  "box",
  "packet",
  "piece",
] as const;

export type KnownUnitType = (typeof UNIT_OPTIONS)[number];

/** Stored on products — preset or free-text custom unit. */
export type UnitType = KnownUnitType | (string & {});

export const UNIT_LABELS: Record<string, string> = {
  units: "Units",
  syringe: "Syringe",
  vial: "Vial",
  mL: "mL",
  cc: "cc",
  lines: "Lines",
  box: "Box",
  packet: "Packet",
  piece: "Piece",
};

/** Display label for a product unit_type (legacy units/lines + new presets + custom). */
export function formatUnitLabel(unit: string | null | undefined): string {
  if (!unit) return "Units";
  return UNIT_LABELS[unit] || unit;
}

export type ActivityType = "receive" | "consumption" | "sale" | "adjust" | "transfer";

export type UserRole =
  | "admin"
  | "manager"
  | "head_nurse"
  | "nurse"
  | "staff"
  | "doctor"
  | "accountant";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  password_hash: string;
  created_at: string;
}

/** Safe user shape returned to the client (no password hash). */
export interface PublicUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
}

export interface Product {
  id: number;
  barcode: string;
  /** Manufacturer GTINs / unique package codes (Data Matrix, QR) linked to this INV. */
  barcode_aliases?: string[];
  category: string;
  product: string;
  expiry: string | null;
  status: string;
  unit_type: UnitType;
  /** Optional unit price; null/omitted for legacy products. */
  price: number | null;
  total: number;
  created_at: string;
}

export interface StockHolding {
  id: number;
  product_id: number;
  location: Location;
  qty: number;
}

export interface Activity {
  id: number;
  product_id: number;
  location: string;
  type: ActivityType;
  qty: number;
  note: string | null;
  created_at: string;
  username?: string | null;
  product_name?: string;
  barcode?: string;
}

export interface ProductWithStock extends Product {
  holdings: StockHolding[];
}

export interface DashboardData {
  totalProducts: number;
  totalQty: number;
  expiryAlerts: Product[];
  stockByLocation: { location: string; qty: number }[];
  recentActivity: Activity[];
  lowStock: Product[];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Clinic Manager",
  head_nurse: "Head Nurse",
  nurse: "Nurse",
  staff: "Staff",
  doctor: "Doctor",
  accountant: "Accountant",
};
