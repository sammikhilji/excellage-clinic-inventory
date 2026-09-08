"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthGate";
import type { UserRole } from "@/lib/types";

const EDITOR_ROLES: UserRole[] = ["admin", "manager", "head_nurse"];

export default function SettingsPage() {
  const { user } = useAuth();
  const canEdit = !!user && EDITOR_ROLES.includes(user.role);

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

  const load = useCallback(async () => {
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

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Settings</h2>
        <p className="text-sm text-slate-500">
          Rename locations and category headings across the whole inventory.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {err && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
          {err}
        </div>
      )}

      {!canEdit && !loading && (
        <div className="card p-4 text-sm text-slate-600">
          Only admin, clinic manager, or head nurse can rename locations and
          categories. You can still view the current lists below.
        </div>
      )}

      <section className="card p-4 space-y-3">
        <h3 className="font-bold">Rename location</h3>
        <p className="text-xs text-slate-500">
          Updates stock, activity history, and transfer notes. If the new name
          already exists, quantities are merged per product.
        </p>
        {canEdit ? (
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
        ) : (
          <ul className="text-sm text-slate-700 space-y-1">
            {locations.map((l) => (
              <li key={l}>• {l}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h3 className="font-bold">Rename category / heading</h3>
        <p className="text-xs text-slate-500">
          Updates every product currently under that category.
        </p>
        {canEdit ? (
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
        ) : (
          <ul className="text-sm text-slate-700 space-y-1 max-h-48 overflow-y-auto">
            {categories.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/" className="btn-secondary w-full text-sm">
        ← Back to home
      </Link>
    </div>
  );
}
