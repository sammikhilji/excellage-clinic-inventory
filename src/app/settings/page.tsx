"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthGate";
import type { PublicUser, UserRole } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";

const CREATABLE_ROLES: UserRole[] = [
  "staff",
  "nurse",
  "doctor",
  "manager",
  "head_nurse",
  "accountant",
  "admin",
];

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = !!user && user.role === "admin";

  const [locations, setLocations] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [locFrom, setLocFrom] = useState("");
  const [locTo, setLocTo] = useState("");
  const [catFrom, setCatFrom] = useState("");
  const [catTo, setCatTo] = useState("");
  const [busyLoc, setBusyLoc] = useState(false);
  const [busyCat, setBusyCat] = useState(false);
  const [okLoc, setOkLoc] = useState<string | null>(null);
  const [okCat, setOkCat] = useState<string | null>(null);

  // Staff users
  const [staff, setStaff] = useState<PublicUser[]>([]);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [password, setPassword] = useState("");
  const [busyUser, setBusyUser] = useState(false);
  const [userErr, setUserErr] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [createdUsername, setCreatedUsername] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Failed to load settings");
        return;
      }
      setLocations(data.locations || []);
      setCategories(data.categories || []);
      if (!locFrom && data.locations?.length) setLocFrom(data.locations[0]);
      if (!catFrom && data.categories?.length) setCatFrom(data.categories[0]);
    } catch {
      setErr("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [locFrom, catFrom]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok && Array.isArray(data.users)) setStaff(data.users);
    } catch {
      /* ignore */
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      setErr("Admin only (Mohamed).");
      return;
    }
    void loadSettings();
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function renameLocation(e: React.FormEvent) {
    e.preventDefault();
    setOkLoc(null);
    setErr(null);
    if (!locFrom || !locTo.trim()) {
      setErr("Choose a location and enter a new name");
      return;
    }
    setBusyLoc(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename_location",
          from: locFrom,
          to: locTo.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Rename failed");
        return;
      }
      setLocations(data.locations || []);
      setCategories(data.categories || []);
      const newName = locTo.trim();
      setLocFrom(newName);
      setLocTo("");
      setOkLoc(
        data.merged
          ? `Merged “${locFrom}” into “${newName}”`
          : `Renamed location to “${newName}”`
      );
    } catch {
      setErr("Network error");
    } finally {
      setBusyLoc(false);
    }
  }

  async function renameCategory(e: React.FormEvent) {
    e.preventDefault();
    setOkCat(null);
    setErr(null);
    if (!catFrom || !catTo.trim()) {
      setErr("Choose a category and enter a new name");
      return;
    }
    setBusyCat(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename_category",
          from: catFrom,
          to: catTo.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Rename failed");
        return;
      }
      setLocations(data.locations || []);
      setCategories(data.categories || []);
      const newName = catTo.trim();
      setCatFrom(newName);
      setCatTo("");
      setOkCat(
        `Renamed category to “${newName}” (${data.updated ?? ""} products)`
      );
    } catch {
      setErr("Network error");
    } finally {
      setBusyCat(false);
    }
  }

  async function generatePw() {
    setUserErr(null);
    try {
      const res = await fetch("/api/users/generate-password", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setUserErr(data.error || "Generate failed");
        return;
      }
      setPassword(data.password || "");
    } catch {
      setUserErr("Network error");
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setUserErr(null);
    setCreatedPassword(null);
    setCreatedUsername(null);
    setBusyUser(true);
    try {
      const body: Record<string, unknown> = {
        full_name: fullName.trim(),
        username: username.trim().toLowerCase(),
        role,
      };
      if (password.trim()) {
        body.password = password.trim();
      } else {
        body.generatePassword = true;
      }
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setUserErr(data.error || "Create failed");
        return;
      }
      setCreatedPassword(data.password || null);
      setCreatedUsername(data.user?.username || username);
      setFullName("");
      setUsername("");
      setPassword("");
      setRole("staff");
      await loadUsers();
    } catch {
      setUserErr("Network error");
    } finally {
      setBusyUser(false);
    }
  }

  function canDeleteUser(u: PublicUser): boolean {
    if (!user) return false;
    if (u.username === user.username) return false;
    if (u.username === "mohamed") return false;
    if (u.role === "admin") {
      const admins = staff.filter((s) => s.role === "admin");
      if (admins.length <= 1) return false;
    }
    return true;
  }

  async function deleteUser(u: PublicUser) {
    const ok = window.confirm(
      `Delete user “${u.full_name}” (${u.username})? They will no longer be able to sign in.`
    );
    if (!ok) return;
    setUserErr(null);
    setBusyUser(true);
    try {
      const res = await fetch(
        `/api/users?username=${encodeURIComponent(u.username)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        setUserErr(data.error || "Delete failed");
        return;
      }
      await loadUsers();
    } catch {
      setUserErr("Network error");
    } finally {
      setBusyUser(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold">Settings</h2>
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
          Admin only (Mohamed).
        </div>
        <Link href="/" className="btn-secondary w-full text-sm">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h2 className="text-lg font-bold">Settings</h2>
        <p className="text-sm text-slate-500">
          Manage staff accounts and rename locations / categories.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {err && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
          {err}
        </div>
      )}

      {/* A) Staff users */}
      <section className="card p-4 space-y-3">
        <h3 className="font-bold">Staff users</h3>
        <p className="text-xs text-slate-500">
          Add or remove clinic logins. Generated passwords are shown once —
          copy them before leaving this page.
        </p>

        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {staff.map((u) => (
            <li
              key={u.username}
              className="flex items-center justify-between gap-2 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{u.full_name}</p>
                <p className="text-xs text-slate-500">
                  {u.username} · {ROLE_LABELS[u.role] || u.role}
                </p>
              </div>
              {canDeleteUser(u) ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-rose-600 shrink-0"
                  disabled={busyUser}
                  onClick={() => void deleteUser(u)}
                >
                  Delete
                </button>
              ) : (
                <span className="text-[10px] text-slate-400 shrink-0">
                  Protected
                </span>
              )}
            </li>
          ))}
          {staff.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">No users loaded</li>
          )}
        </ul>

        <form onSubmit={createUser} className="space-y-3 border-t border-slate-100 pt-3">
          <h4 className="text-sm font-semibold">Add user</h4>
          <div>
            <label className="label" htmlFor="user-fullname">
              Full name
            </label>
            <input
              id="user-fullname"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="e.g. Sara Ahmed"
            />
          </div>
          <div>
            <label className="label" htmlFor="user-username">
              Username
            </label>
            <input
              id="user-username"
              className="input font-mono text-sm"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
              }
              required
              placeholder="e.g. sara"
              autoComplete="off"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Lowercase letters, numbers, underscore only.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="user-role">
              Role
            </label>
            <select
              id="user-role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              {CREATABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="user-password">
              Password
            </label>
            <div className="flex gap-2">
              <input
                id="user-password"
                className="input font-mono text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="btn-secondary shrink-0 px-3 text-xs"
                onClick={() => void generatePw()}
              >
                Generate password
              </button>
            </div>
          </div>
          {userErr && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
              {userErr}
            </div>
          )}
          {createdPassword && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-3 text-sm text-emerald-900 space-y-1">
              <p className="font-semibold">
                User created{createdUsername ? `: ${createdUsername}` : ""}
              </p>
              <p className="text-xs text-emerald-800">
                Temporary password (copy now — shown once):
              </p>
              <p className="font-mono text-base font-bold select-all break-all">
                {createdPassword}
              </p>
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busyUser}>
            {busyUser ? "Saving…" : "Create user"}
          </button>
        </form>

        <Link
          href="/password"
          className="block text-center text-xs font-semibold text-brand-700"
        >
          Reset an existing staff password →
        </Link>
      </section>

      {/* B) Rename location */}
      <section className="card p-4 space-y-3">
        <h3 className="font-bold">Rename location</h3>
        <p className="text-xs text-slate-500">
          Updates stock, activity history, and transfer notes. If the new name
          already exists, quantities are merged per product.
        </p>
        <form onSubmit={renameLocation} className="space-y-3">
          <div>
            <label className="label" htmlFor="loc-from">
              Current location
            </label>
            <select
              id="loc-from"
              className="input"
              value={locFrom}
              onChange={(e) => setLocFrom(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="loc-to">
              New name
            </label>
            <input
              id="loc-to"
              className="input"
              value={locTo}
              onChange={(e) => setLocTo(e.target.value)}
              placeholder="e.g. Main Store (Room 1)"
            />
          </div>
          {okLoc && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
              {okLoc}
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busyLoc}>
            {busyLoc ? "Saving…" : "Save location rename"}
          </button>
        </form>
      </section>

      {/* B) Rename category */}
      <section className="card p-4 space-y-3">
        <h3 className="font-bold">Rename category / heading</h3>
        <p className="text-xs text-slate-500">
          Updates every product currently under that category.
        </p>
        <form onSubmit={renameCategory} className="space-y-3">
          <div>
            <label className="label" htmlFor="cat-from">
              Current category
            </label>
            <select
              id="cat-from"
              className="input"
              value={catFrom}
              onChange={(e) => setCatFrom(e.target.value)}
            >
              {categories.length === 0 && (
                <option value="">No categories yet</option>
              )}
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c.length > 50 ? c.slice(0, 50) + "…" : c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cat-to">
              New name
            </label>
            <input
              id="cat-to"
              className="input"
              value={catTo}
              onChange={(e) => setCatTo(e.target.value)}
              placeholder="e.g. Fillers"
            />
          </div>
          {okCat && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
              {okCat}
            </div>
          )}
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={busyCat || categories.length === 0}
          >
            {busyCat ? "Saving…" : "Save category rename"}
          </button>
        </form>
      </section>

      <Link href="/" className="btn-secondary w-full text-sm">
        ← Back to home
      </Link>
    </div>
  );
}
