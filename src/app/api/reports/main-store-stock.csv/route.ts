import { NextRequest, NextResponse } from "next/server";
import { ensureLocations, getStore } from "@/lib/db";
import { REPORT_ALLOWED_ROLES } from "@/lib/monthly-staff-report-types";
import {
  buildMainStoreReport,
  mainStoreReportToCsv,
} from "@/lib/main-store-stock-report";

export const dynamic = "force-dynamic";

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
    const date = req.nextUrl.searchParams.get("date");
    const report = buildMainStoreReport(store, date);
    const csv = mainStoreReportToCsv(report);
    const filename = `Main_Store_Stock_Report_${report.snapshot_date}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
