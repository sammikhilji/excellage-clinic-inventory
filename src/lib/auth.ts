/** Client-safe auth session helpers (no secrets). */
import type { PublicUser, UserRole } from "./types";

export const AUTH_STORAGE_KEY = "clinic_inventory_auth";
export const AUTH_COOKIE = "clinic_auth";

/** PIN fallback is OFF — multi-user username/password is the only login path. */
export const PIN_FALLBACK_ENABLED = false;

export type AuthSession = {
  ok: true;
  user: PublicUser;
  at: number;
};

export function parseAuthSession(raw: string | null): AuthSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession> & { ok?: boolean };
    if (
      parsed?.ok &&
      parsed.user &&
      typeof parsed.user.username === "string" &&
      typeof parsed.user.full_name === "string" &&
      typeof parsed.user.role === "string"
    ) {
      return {
        ok: true,
        user: {
          id: Number(parsed.user.id) || 0,
          username: parsed.user.username,
          full_name: parsed.user.full_name,
          role: parsed.user.role as UserRole,
        },
        at: typeof parsed.at === "number" ? parsed.at : Date.now(),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}
