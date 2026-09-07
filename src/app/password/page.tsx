"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthGate";
import type { PublicUser } from "@/lib/types";

export default function PasswordPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [staff, setStaff] = useState<PublicUser[]>([]);
  const [targetUsername, setTargetUsername] = useState("");
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const [adminErr, setAdminErr] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "admin") return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.users)) setStaff(d.users);
      })
      .catch(() => {});
  }, [user]);

  async function onChangeOwn(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (newPassword !== confirm) {
      setErr("New passwords do not match");
      return;
    }
    if (!user) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Failed");
        return;
      }
      setMsg("Password updated. Use the new password next login.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function onAdminReset(e: FormEvent) {
    e.preventDefault();
    setAdminErr(null);
    setAdminMsg(null);
    if (!user) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUsername: user.username,
          targetUsername,
          newPassword: adminNewPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdminErr(data.error || "Failed");
        return;
      }
      setAdminMsg(`Reset password for ${data.username}`);
      setAdminNewPassword("");
    } catch {
      setAdminErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Password</h2>
        <Link href="/" className="text-sm font-semibold text-brand-700">
          ← Home
        </Link>
      </div>

      <form onSubmit={onChangeOwn} className="card space-y-3 p-4">
        <h3 className="font-semibold">Change my password</h3>
        <label className="block text-sm">
          <span className="label">Current password</span>
          <input
            type="password"
            className="input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <label className="block text-sm">
          <span className="label">New password</span>
          <input
            type="password"
            className="input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm">
          <span className="label">Confirm new password</span>
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>

      {user.role === "admin" && (
        <form onSubmit={onAdminReset} className="card space-y-3 p-4">
          <h3 className="font-semibold">Admin — reset a staff password</h3>
          <label className="block text-sm">
            <span className="label">Staff username</span>
            <select
              className="input"
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              required
            >
              <option value="">Select user…</option>
              {staff.map((s) => (
                <option key={s.username} value={s.username}>
                  {s.full_name} ({s.username})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="label">New temporary password</span>
            <input
              type="password"
              className="input"
              value={adminNewPassword}
              onChange={(e) => setAdminNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {adminErr && <p className="text-sm text-rose-600">{adminErr}</p>}
          {adminMsg && <p className="text-sm text-emerald-700">{adminMsg}</p>}
          <button type="submit" className="btn-secondary w-full" disabled={busy}>
            Reset staff password
          </button>
        </form>
      )}
    </div>
  );
}
