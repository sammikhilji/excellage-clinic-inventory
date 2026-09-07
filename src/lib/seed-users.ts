/**
 * Server-only seed user definitions.
 * Plaintext passwords are used once at seed time to create bcrypt/scrypt hashes,
 * then discarded from the running store. Client bundles must never import this file.
 */
import type { UserRole } from "./types";
import { hashPassword } from "./passwords";
import type { User } from "./types";

export type SeedUserDef = {
  fullName: string;
  role: UserRole;
  username: string;
  password: string;
  notes: string;
};

/** Temporary passwords — Word+number+symbol. Hand out via staff CSV/PDF only. */
export const SEED_USER_DEFS: SeedUserDef[] = [
  {
    fullName: "Mohamed",
    role: "admin",
    username: "mohamed",
    password: "Harbor92!",
    notes: "Admin — full access including user management. Change after first login recommended.",
  },
  {
    fullName: "Ashtar Suliman",
    role: "manager",
    username: "ashtar",
    password: "Lantern47#",
    notes: "Clinic Manager. Change after first login recommended.",
  },
  {
    fullName: "Nada Batnini",
    role: "staff",
    username: "nada",
    password: "Meadow83$",
    notes: "Therapist. Change after first login recommended.",
  },
  {
    fullName: "Jacky Lou Gaoat",
    role: "head_nurse",
    username: "jacky",
    password: "Cascade61!",
    notes: "Head Nurse. Change after first login recommended.",
  },
  {
    fullName: "Christiane Faye Pelayo",
    role: "head_nurse",
    username: "faye",
    password: "Blossom29#",
    notes: "Head Nurse. Change after first login recommended.",
  },
  {
    fullName: "Eloisa Joy Lopez",
    role: "staff",
    username: "eloisa",
    password: "Summit54$",
    notes: "Nurse. Change after first login recommended.",
  },
  {
    fullName: "Francia Realyn Sarmiento",
    role: "staff",
    username: "francia",
    password: "Orchard76!",
    notes: "Nurse. Change after first login recommended.",
  },
  {
    fullName: "Charmine Garcia",
    role: "staff",
    username: "charmine",
    password: "Whisper38#",
    notes: "Therapist. Change after first login recommended.",
  },
  {
    fullName: "Lujain Firas",
    role: "staff",
    username: "lujain",
    password: "Horizon15$",
    notes: "Therapist. Change after first login recommended.",
  },
  {
    fullName: "Ivy Mesa",
    role: "staff",
    username: "ivy",
    password: "Willow92!",
    notes: "Nurse. Change after first login recommended.",
  },
  {
    fullName: "Dr. Ahmad",
    role: "doctor",
    username: "drahmed",
    password: "Scalpel64#",
    notes: "Doctor. Change after first login recommended.",
  },
  {
    fullName: "Raj Rajamohanan",
    role: "accountant",
    username: "raj",
    password: "Ledger55$",
    notes: "Accountant. Change after first login recommended.",
  },
  {
    fullName: "Somaieh Mardaneh",
    role: "nurse",
    username: "somaieh",
    password: "Coral91#",
    notes: "Nurse. Change after first login recommended.",
  },
];

export function buildSeedUsers(startId = 1): User[] {
  const createdAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  return SEED_USER_DEFS.map((def, i) => ({
    id: startId + i,
    username: def.username,
    full_name: def.fullName,
    role: def.role,
    password_hash: hashPassword(def.password),
    created_at: createdAt,
  }));
}
