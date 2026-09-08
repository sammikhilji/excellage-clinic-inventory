"use client";

import { useEffect, useState } from "react";
import { formatUnitLabel, UNIT_OPTIONS, UNIT_LABELS } from "@/lib/types";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/components/AuthGate";
import BarcodeScanner from "@/components/BarcodeScanner";
import {
  activityTypeLabel,
  formatDateLabel,
  timeOnly,
} from "@/lib/activity-display";

type Detail = {
  id: number;
  barcode: string;
  barcode_aliases?: string[];
  category: string;
  product: string;
  expiry: string | null;
  status: string;
  unit_type: string;
  price: number | null;
  total: number;
  holdings: { location: string; qty: number }[];
  activity: {
    id: number;
    location: string;
    type: string;
    qty: number;
    note: string | null;
    created_at: string;
  }[];
};

const CAN_EDIT = new Set(["admin", "manager", "head_nurse"]);

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const id = params.id as string;
  const [item, setItem] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [expiry, setExpiry] = useState("");
  const [unitType, setUnitType] = useState<string>("units");
  const [customUnit, setCustomUnit] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [aliasMsg, setAliasMsg] = useState<string | null>(null);
  const [showAliasScan, setShowAliasScan] = useState(false);

  const canEdit = !!user && CAN_EDIT.has(user.role);

  function load() {
    return fetch(`/api/products/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data: Detail) => {
        setItem(data);
        setName(data.product);
        setCategory(data.category);
        setExpiry(data.expiry || "");
        const known = (UNIT_OPTIONS as readonly string[]).includes(data.unit_type);
        setUnitType(known ? data.unit_type : "__custom__");
        setCustomUnit(known ? "" : data.unit_type || "");
        setPrice(data.price != null ? String(data.price) : "");
      })
      .catch(() => setErr("Product not found"));
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/products/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: name.trim(),
          category: category.trim(),
          expiry: expiry.trim() || null,
          unit_type:
            unitType === "__custom__"
              ? customUnit.trim() || "units"
              : unitType,
          price: price.trim() === "" ? null : Number(price),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Save failed");
        return;
      }
      setEditing(false);
      setMsg("Saved");
      await load();
    } catch {
      setMsg("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function linkAlias(code: string) {
    if (!item) return;
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setAliasMsg(null);
    try {
      const res = await fetch(`/api/products/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link_alias: trimmed,
          adopt_scan_expiry: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAliasMsg(data.error || "Link failed");
        return;
      }
      setAliasInput("");
      setShowAliasScan(false);
      setAliasMsg("Unique code linked");
      await load();
    } catch {
      setAliasMsg("Link failed");
    } finally {
      setBusy(false);
    }
  }

  async function unlinkAlias(code: string) {
    if (!item) return;
    const ok = window.confirm(`Unlink unique code ${code}?`);
    if (!ok) return;
    setBusy(true);
    setAliasMsg(null);
    try {
      const res = await fetch(`/api/products/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlink_alias: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAliasMsg(data.error || "Unlink failed");
        return;
      }
      setAliasMsg("Unlinked");
      await load();
    } catch {
      setAliasMsg("Unlink failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct() {
    if (!item) return;
    const ok = window.confirm(
      `Delete "${item.product}"? This removes it from all locations.`
    );
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/products/${item.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || "Delete failed");
        return;
      }
      router.push("/inventory");
    } catch {
      setMsg("Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (err) return <p className="text-rose-600">{err}</p>;
  if (!item) return <p className="text-sm text-slate-500">Loading…</p>;

  const unit = formatUnitLabel(item.unit_type);
  const aliases = item.barcode_aliases || [];

  return (
    <div className="space-y-4">
      <Link href="/inventory" className="text-sm text-brand-700 font-semibold">
        ← Back to stock
      </Link>

      <div className="card p-4 space-y-2">
        <p className="font-mono text-xs text-slate-500">{item.barcode}</p>
        {aliases.length > 0 && (
          <p className="font-mono text-[10px] text-slate-400">
            Unique: {aliases.join(", ")}
          </p>
        )}
        <h2 className="text-xl font-bold leading-snug">{item.product}</h2>
        <p className="text-sm text-slate-500">{item.category}</p>
        <div className="flex flex-wrap gap-2 items-center pt-1">
          <StatusBadge status={item.status} />
          {item.expiry && (
            <span className="text-sm text-slate-600">Expiry: {item.expiry}</span>
          )}
        </div>
        <p className="text-2xl font-bold pt-2">
          {item.total}{" "}
          <span className="text-sm font-medium text-slate-500">{unit}</span>
        </p>
        {item.price != null && (
          <p className="text-sm text-slate-600">
            Price:{" "}
            <span className="font-semibold">
              {item.price.toLocaleString(undefined, {
                style: "currency",
                currency: "AED",
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </span>
          </p>
        )}
      </div>

      {canEdit && (
        <section className="card p-4 space-y-3">
          <h3 className="font-bold">Unique package codes</h3>
          <p className="text-xs text-slate-500">
            Link manufacturer GTIN, Data Matrix, or QR sticker codes so scans
            resolve to {item.barcode}.
          </p>
          {aliases.length === 0 ? (
            <p className="text-sm text-slate-500">No unique codes linked yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {aliases.map((a) => (
                <li
                  key={a}
                  className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                >
                  <span className="font-mono text-xs break-all">{a}</span>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-rose-600 shrink-0"
                    disabled={busy}
                    onClick={() => void unlinkAlias(a)}
                  >
                    Unlink
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void linkAlias(aliasInput);
            }}
            className="flex gap-2"
          >
            <input
              className="input font-mono text-sm"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              placeholder="Scan or type GTIN / unique code"
            />
            <button
              type="submit"
              className="btn-primary shrink-0 px-3 text-sm"
              disabled={busy || !aliasInput.trim()}
            >
              Link
            </button>
          </form>
          <button
            type="button"
            className="btn-secondary w-full text-sm"
            onClick={() => setShowAliasScan((v) => !v)}
          >
            {showAliasScan ? "Hide camera" : "Scan package to link"}
          </button>
          {showAliasScan && (
            <BarcodeScanner
              active={showAliasScan && !busy}
              onScan={(code) => void linkAlias(code)}
            />
          )}
          {aliasMsg && (
            <p
              className={`text-sm ${
                aliasMsg.includes("fail") || aliasMsg.includes("already")
                  ? "text-rose-600"
                  : "text-emerald-700"
              }`}
            >
              {aliasMsg}
            </p>
          )}
        </section>
      )}

      {canEdit && (
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold">Edit product</h3>
            {!editing ? (
              <button
                type="button"
                className="btn-primary text-xs px-3 py-1.5"
                onClick={() => {
                  setName(item.product);
                  setCategory(item.category);
                  setExpiry(item.expiry || "");
                  const known = (UNIT_OPTIONS as readonly string[]).includes(
                    item.unit_type
                  );
                  setUnitType(known ? item.unit_type : "__custom__");
                  setCustomUnit(known ? "" : item.unit_type || "");
                  setPrice(item.price != null ? String(item.price) : "");
                  setEditing(true);
                  setMsg(null);
                }}
              >
                Edit
              </button>
            ) : (
              <button
                type="button"
                className="text-xs text-slate-600 font-semibold"
                onClick={() => {
                  setEditing(false);
                  setMsg(null);
                }}
              >
                Cancel
              </button>
            )}
          </div>

          {editing ? (
            <form onSubmit={saveEdit} className="space-y-3">
              <div>
                <label className="label" htmlFor="edit-name">
                  Name
                </label>
                <input
                  id="edit-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="edit-category">
                  Heading / category
                </label>
                <input
                  id="edit-category"
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. PHARMACY, CONSUMABLES"
                />
              </div>
              <div>
                <label className="label" htmlFor="edit-expiry">
                  Expiry date
                </label>
                <input
                  id="edit-expiry"
                  className="input"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  placeholder="e.g. Jan-28 or 2028-01"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Leave blank to clear expiry.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="edit-unit">
                  Unit (how stock is counted)
                </label>
                <select
                  id="edit-unit"
                  className="input py-2.5 text-sm"
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value)}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {UNIT_LABELS[u] || u}
                    </option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </select>
                {unitType === "__custom__" && (
                  <input
                    className="input mt-2"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    placeholder="e.g. ampule, kit, cartridge"
                  />
                )}
              </div>
              <div>
                <label className="label" htmlFor="edit-price">
                  Price (optional)
                </label>
                <input
                  id="edit-price"
                  type="number"
                  min={0}
                  step="any"
                  className="input"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Leave blank for no price"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Money amount per product — separate from unit type. Clear to remove.
                </p>
              </div>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={busy}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </form>
          ) : null}

          <button
            type="button"
            className="btn-danger w-full text-sm"
            disabled={busy}
            onClick={() => void deleteProduct()}
          >
            Delete product
          </button>
          {msg && (
            <p
              className={`text-sm ${msg === "Saved" ? "text-emerald-700" : "text-rose-600"}`}
            >
              {msg}
            </p>
          )}
        </section>
      )}

      <section className="card p-4">
        <h3 className="font-bold mb-3">Per location</h3>
        <div className="space-y-2">
          {item.holdings.map((h) => (
            <div
              key={h.location}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5"
            >
              <span className="text-sm">{h.location}</span>
              <span className="font-bold">{h.qty}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Link
          href={`/add?barcode=${encodeURIComponent(item.barcode)}`}
          className="btn-success text-xs"
        >
          Add
        </Link>
        <Link
          href={`/transfer?barcode=${encodeURIComponent(item.barcode)}`}
          className="btn-primary text-xs"
        >
          Move
        </Link>
        <Link
          href={`/consume?barcode=${encodeURIComponent(item.barcode)}`}
          className="btn-danger text-xs"
        >
          Use
        </Link>
      </div>

      <section className="card p-4">
        <h3 className="font-bold mb-3">Activity history</h3>
        {item.activity.length === 0 ? (
          <p className="text-sm text-slate-500">No movements yet</p>
        ) : (
          <ul className="space-y-2">
            {item.activity.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-slate-100 px-3 py-2 text-sm"
              >
                <div className="flex justify-between">
                  <span className="font-medium">{activityTypeLabel(a.type)}</span>
                  <span
                    className={
                      a.type === "receive"
                        ? "text-emerald-700"
                        : a.type === "transfer"
                          ? "text-brand-700"
                          : "text-rose-700"
                    }
                  >
                    {a.type === "receive"
                      ? "+"
                      : a.type === "transfer"
                        ? "↔"
                        : "−"}
                    {a.qty}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-700">
                  {formatDateLabel(a.created_at)}
                  {timeOnly(a.created_at) ? ` · ${timeOnly(a.created_at)}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {a.location}
                  {a.note ? ` · ${a.note}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
