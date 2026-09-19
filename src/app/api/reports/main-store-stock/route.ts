import { NextRequest, NextResponse } from "next/server";
import { ensureLocations, getStore } from "@/lib/db";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";
import { getPrevSnapshot } from "@/lib/main-store-stock-report";

export const dynamic = "force-dynamic";

/** Lightweight meta for UI defaults (last snapshot / seed From date). */
export async function GET(req: NextRequest) {
  try {
    const username = req.cookies.get("clinic_user")?.value?.toLowerCase();
    if (!username) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const store = await getStore();
    ensureLocations(store);
    const me = store.users.find((u) => u.username === username);
    if (!me || !REPORT_ALLOWED_ROLES.includes(me.role)) {
      return NextResponse.json(
        { error: "Forbidden — admin, manager, or head nurse only" },
        { status: 403 }
      );
    }
    const saved = store.main_store_report_snapshot;
    const prev = getPrevSnapshot(store);
    return NextResponse.json({
      last_snapshot_date: saved?.snapshot_date || null,
      last_snapshot_label: saved?.label || null,
      default_from: saved?.snapshot_date || prev.snapshot_date || "2026-09-17",
      seed_date: "2026-09-17",
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
