import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEYLEN = 64;

/** Hash a password with scrypt (salt stored in the hash string). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

/** Verify password against a stored scrypt hash. */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, salt, hash] = stored.split(":");
    if (algo !== "scrypt" || !salt || !hash) return false;
    const computed = scryptSync(password, salt, KEYLEN);
    const expected = Buffer.from(hash, "hex");
    if (computed.length !== expected.length) return false;
    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

/** Readable Word+digits+symbol passwords (~10–12 chars), similar to seed style. */
const PASSWORD_WORDS = [
  "Harbor",
  "Lantern",
  "Meadow",
  "Cascade",
  "Blossom",
  "Summit",
  "Orchard",
  "Whisper",
  "Horizon",
  "Willow",
  "Coral",
  "River",
  "Maple",
  "Cedar",
  "Amber",
  "Silver",
  "Crystal",
  "Forest",
  "Garden",
  "Beacon",
] as const;

const PASSWORD_SYMBOLS = ["!", "#", "$", "%", "@", "*"] as const;

function randomInt(max: number): number {
  const buf = randomBytes(4);
  return buf.readUInt32BE(0) % max;
}

/** Generate a temporary staff password: CapitalWord + 2 digits + symbol. */
export function generatePassword(): string {
  const word = PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)];
  const digits = String(10 + randomInt(90)); // 10–99
  const symbol = PASSWORD_SYMBOLS[randomInt(PASSWORD_SYMBOLS.length)];
  return `${word}${digits}${symbol}`;
}
