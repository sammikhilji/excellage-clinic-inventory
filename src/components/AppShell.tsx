"use client";

import Link from "next/link";
import AuthGate, { useAuth } from "./AuthGate";
import Nav from "./Nav";
import { ROLE_LABELS } from "@/lib/types";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";

function Header() {
  const { loggedIn, user, logout } = useAuth();
  const canReport = !!user && REPORT_ALLOWED_ROLES.includes(user.role);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
            Clinic
          </p>
          <h1 className="text-base font-bold leading-none">Inventory</h1>
        </div>
        <div className="flex items-center gap-2">
          {loggedIn && user ? (
            <>
              <div className="text-right leading-tight">
                <p className="text-xs font-semibold text-slate-800 truncate max-w-[9rem]">
                  {user.full_name}
                </p>
                <p className="text-[10px] text-slate-500">
                  {ROLE_LABELS[user.role] || user.role}
                </p>
              </div>
              {canReport && (
                <Link
                  href="/reports"
                  className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"
                >
                  Report
                </Link>
              )}
              <Link
                href="/password"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600"
              >
                Password
              </Link>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600"
              >
                Log out
              </button>
            </>
          ) : (
            <span className="badge bg-brand-50 text-brand-700">131 SKUs</span>
          )}
        </div>
      </div>
    </header>
  );
}

function ShellBody({ children }: { children: React.ReactNode }) {
  const { loggedIn } = useAuth();
  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 py-4">{children}</main>
      {loggedIn && <Nav />}
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <ShellBody>{children}</ShellBody>
    </AuthGate>
  );
}
